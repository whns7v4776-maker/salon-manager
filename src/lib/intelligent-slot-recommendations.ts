export type IntelligentResourceGroup = { options: {
  start:number; end:number; busy:readonly {start:number;end:number}[];
  intervals:readonly {startOffsetMinutes:number;durationMinutes:number}[];
  catalogDurations:readonly number[];
}[] };
/** Filters authoritative starts against resource timelines. It never creates
 * availability or replaces server validation of a complete booking plan. */
export function recommendIntelligentSlots({ slots, planDurationMinutes, resourceGroups }: {
  slots: readonly string[]; planDurationMinutes: number;
  resourceGroups: readonly IntelligentResourceGroup[];
}): string[] {
  const minute = (value: string) => {
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return NaN;
    const h = Number(match[1]), m = Number(match[2]);
    return h < 24 && m < 60 ? h * 60 + m : NaN;
  };
  if (!Number.isFinite(planDurationMinutes) || planDurationMinutes <= 0) return [];
  const candidates = [...new Set(slots)].map(time => ({ time, start: minute(time) }))
    .filter(item => Number.isFinite(item.start)).sort((a, b) => a.start - b.start);
  if (!candidates.length) return [];

    if (!resourceGroups.length || resourceGroups.some(group=>!group.options.length)) return [];
    const prepared = resourceGroups.map(group=>group.options.map(option=> {
      const durations=[...new Set(option.catalogDurations.filter(d=>Number.isInteger(d)&&d>0&&d<=1440))];
      const packable=new Uint8Array(1441);packable[0]=1;
      for(let length=1;length<=1440;length++)for(const duration of durations)if(duration<=length&&packable[length-duration]){packable[length]=1;break;}
      return {...option,packable,longest:durations.length?Math.max(...durations):0};
    }));
    return candidates.filter(candidate=>prepared.every(options=>options.some(option=> {
      if(!option.intervals.length||!option.longest)return false;
      const inserted=option.intervals.map(interval=>({start:candidate.start+interval.startOffsetMinutes,end:candidate.start+interval.startOffsetMinutes+interval.durationMinutes}));
      if(inserted.some(interval=>interval.start<option.start||interval.end>option.end||option.busy.some(busy=>interval.start<busy.end&&busy.start<interval.end)))return false;
      const first=Math.min(...inserted.map(interval=>interval.start));
      const last=Math.max(...inserted.map(interval=>interval.end));
      let left=option.start,right=option.end;
      option.busy.forEach(busy=>{if(busy.end<=first)left=Math.max(left,busy.end);if(busy.start>=last)right=Math.min(right,busy.start);});
      const before=first-left,after=right-last;
      // Deliberate processing time between this plan's phases stays reusable;
      // only newly created outer gaps affect recommendations.
      const delayedPhaseAtOpening = left===option.start && option.intervals.every(interval=>interval.startOffsetMinutes>0);
      if(!option.packable[before]&&!delayedPhaseAtOpening)return false;
      // A closing-day tail is not an unusable gap between two appointments.
      if(!option.packable[after]&&right!==option.end)return false;
      if(before+after>=option.longest&&Math.max(before,after)<option.longest)return false;
      return true;
    }))).map(candidate=>candidate.time);
}
