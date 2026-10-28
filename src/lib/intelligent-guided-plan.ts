import { isSalonCapacityOperatorId, getPublicSlotIntervalForDate, isSlotBlockedByOverride, getAppointmentBufferMinutes, getMatchingCalendarExceptions, getPublicEligibleOperatorsForService,
  getServiceDuration, getWeeklyDaySchedule, timeToMinutes, type AvailabilitySettings, type SharedService,
  type SharedOperator, type SharedAppointment } from './booking';
import { getServiceOperatorBusyIntervals, getServicePhaseOperator, normalizeServicePhaseConfig, type ServicePhaseOperatorAssignments } from './service-phases';
import { normalizeServiceLinkConfig } from './service-compositions';
import type { IntelligentResourceGroup } from './intelligent-slot-recommendations';

type Interval = { start: number; end: number };
export function buildIntelligentGuidedPlan({ services, operators, appointments, date, settings, planServices,
  selectedOperatorId, selectedOperatorName, automaticSplit }: {
  services: SharedService[]; operators: SharedOperator[]; appointments: (Pick<SharedAppointment, 'ora' | 'servizio'> & Partial<SharedAppointment> & {phaseOperatorAssignments?:ServicePhaseOperatorAssignments})[];
  date: string; settings: AvailabilitySettings; planServices: SharedService[];
  selectedOperatorId: string; selectedOperatorName: string; automaticSplit: boolean;
}): IntelligentResourceGroup[] {
  const schedule = getWeeklyDaySchedule(settings, date);
  const bounds = { start: timeToMinutes(schedule.startTime), end: timeToMinutes(schedule.endTime) };
  const virtual = !operators.length;
  const lanes = virtual ? [{ id: 'salon-capacity', nome: '', mestiere: '' }] : operators;
  const eligibilityCache = new Map<string, SharedOperator[]>();
  const durationCache = new Map<string, number>();
  const durationOf = (service: SharedService) => {
    if (!durationCache.has(service.id)) durationCache.set(service.id, getServiceDuration(service.nome, services));
    return durationCache.get(service.id)!;
  };
  const eligible = (service: SharedService) => {
    if (!eligibilityCache.has(service.id)) eligibilityCache.set(service.id, virtual ? lanes :
      getPublicEligibleOperatorsForService({serviceName: service.nome, services, operators, appointmentDate: date, settings}));
    return eligibilityCache.get(service.id)!;
  };
  const expands = (service: SharedService): SharedService[][] => {
    if (service.compositionId && service.compositionItems?.length) {
      const parts = [...service.compositionItems].sort((a,b)=>a.position-b.position)
        .map(item=>services.find(candidate=>candidate.id===item.serviceId));
      return parts.every(Boolean) ? [parts as SharedService[]] : [];
    }
    const link = normalizeServiceLinkConfig(service.linkedServiceConfig);
    if (!link) return [[service]];
    const ids = link.dependencyMode === 'automatic' ? link.requiredServiceIds.slice(0,1) : link.suggestedServiceIds;
    return ids.flatMap(id=>{const dependency=services.find(candidate=>candidate.id===id&&candidate.id!==service.id&&candidate.disponibileOnline!==false);return dependency?[[service,dependency]]:[];});
  };
  const catalog = services.filter(service=>service.disponibileOnline!==false).flatMap(expands);
  const resourceById = new Map(lanes.map(operator=> {
    const busy: Interval[] = [];
    if(settings.lunchBreakEnabled) busy.push({start:timeToMinutes(settings.lunchBreakStart),end:timeToMinutes(settings.lunchBreakEnd)});
    getMatchingCalendarExceptions(settings,date,{selectedOperatorId:operator.id,selectedOperatorName:operator.nome})
      .forEach(item=>busy.push(item.allDay?bounds:{start:timeToMinutes(item.startTime??schedule.startTime),end:timeToMinutes(item.endTime??schedule.endTime)}));
    settings.slotOverrides.filter(item=>item.date===date&&item.blocked&&isSlotBlockedByOverride(settings,date,item.time,{selectedOperatorId:operator.id,selectedOperatorName:operator.nome}))
      .forEach(item=>busy.push({start:timeToMinutes(item.time),end:timeToMinutes(item.time)+getPublicSlotIntervalForDate(settings,date)}));
    appointments.filter(item=>!item.data||item.data===date).forEach(item=> {
      const service=services.find(candidate=>candidate.nome===item.servizio);
      // A saved appointment duration must not drift when its catalogue is edited.
      const phases=normalizeServicePhaseConfig(item.phaseConfig) ?? (item.durataMinuti ? undefined : normalizeServicePhaseConfig(service?.phaseConfig));
      getServiceOperatorBusyIntervals({durataMinuti:item.durataMinuti??getServiceDuration(item.servizio,services),phaseConfig:phases})
        .forEach(interval=> {
          const assigned=getServicePhaseOperator({assignments:item.phaseOperatorAssignments,phase:interval.phase,fallbackId:item.operatoreId,fallbackName:item.operatoreNome});
          const same = virtual || (!assigned.id&&!assigned.name) || (assigned.id ? assigned.id===operator.id : !!assigned.name&&assigned.name.trim().toLowerCase()===operator.nome.trim().toLowerCase());
          if(!same)return;
          const start=timeToMinutes(item.ora)+interval.startOffsetMinutes;
          busy.push({start,end:start+interval.durationMinutes+getAppointmentBufferMinutes(settings)});
        });
    });
    busy.sort((a,b)=>a.start-b.start);
    const merged:Interval[]=[];
    busy.forEach(interval=>{const previous=merged[merged.length-1];if(previous&&interval.start<=previous.end)previous.end=Math.max(previous.end,interval.end);else merged.push({...interval});});
    const durations=catalog.filter(parts=>parts.every(service=>eligible(service).some(candidate=>candidate.id===operator.id)))
      .map(parts=>parts.reduce((total,service)=>total+durationOf(service),0)+getAppointmentBufferMinutes(settings));
    return [operator.id,{...bounds,busy:merged,catalogDurations:durations}] as const;
  }));
  const units: { intervals:{startOffsetMinutes:number;durationMinutes:number}[]; eligibleIds:Set<string> }[]=[];
  let offset=0;
  planServices.forEach(service=> {
    const phases=normalizeServicePhaseConfig(service.phaseConfig);
    const intervals=getServiceOperatorBusyIntervals(service);
    const phaseOptions=intervals.map(interval=> {
      const phaseService=interval.phase==='final'&&phases?.finalServiceId ? services.find(item=>item.id===phases.finalServiceId)??service : service;
      return {interval:{...interval,startOffsetMinutes:offset+interval.startOffsetMinutes,durationMinutes:interval.durationMinutes+getAppointmentBufferMinutes(settings)},ids:new Set(eligible(phaseService).map(operator=>operator.id))};
    });
    if(automaticSplit&&phases?.allowFrontendSplitOperators!==false)phaseOptions.forEach(option=>units.push({intervals:[option.interval],eligibleIds:option.ids}));
    else units.push({intervals:phaseOptions.map(option=>option.interval),eligibleIds:new Set([...phaseOptions[0]?.ids??[]].filter(id=>phaseOptions.every(option=>option.ids.has(id))))});
    offset+=durationOf(service);
  });
  const groups=automaticSplit?units:[{intervals:units.flatMap(unit=>unit.intervals),eligibleIds:new Set([...units[0]?.eligibleIds??[]].filter(id=>units.every(unit=>unit.eligibleIds.has(id))))}];
  return groups.map(group=>({ options:[...group.eligibleIds].filter(id=> {
    if(isSalonCapacityOperatorId(selectedOperatorId)||(!selectedOperatorId&&!selectedOperatorName))return true;
    const operator=lanes.find(item=>item.id===id);
    return selectedOperatorId?selectedOperatorId===id:operator?.nome.trim().toLowerCase()===selectedOperatorName.trim().toLowerCase();
  }).flatMap(id=>{const resource=resourceById.get(id);return resource?[{...resource,intervals:group.intervals}]:[];}) }));
}
