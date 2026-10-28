import { getServiceOperatorBusyIntervals, getServicePhaseOperator } from './service-phases';
import { lowerItalian } from './italian-case';
const normalizeOperatorNameKey = (value?: string) => lowerItalian((value ?? '').trim());

export const isSameOperatorIdentity = (
  item: { operatoreId?: string; operatoreNome?: string; phaseConfig?: import('./service-phases').ServicePhaseConfig; phaseOperatorAssignments?: import('./service-phases').ServicePhaseOperatorAssignments },
  operator: { id: string; nome: string }
): boolean => {
  if (item.phaseConfig && item.phaseOperatorAssignments) {
    return getServiceOperatorBusyIntervals(item).some((interval) => {
      const assigned = getServicePhaseOperator({ assignments: item.phaseOperatorAssignments, phase: interval.phase, fallbackId: item.operatoreId, fallbackName: item.operatoreNome });
      return isSameOperatorIdentity({ operatoreId: assigned.id, operatoreNome: assigned.name }, operator);
    });
  }
  const appointmentOperatorId = item.operatoreId?.trim() ?? '';
  const appointmentOperatorName = normalizeOperatorNameKey(item.operatoreNome);
  const operatorId = operator.id.trim();
  const operatorName = normalizeOperatorNameKey(operator.nome);

  if (appointmentOperatorId && operatorId) {
    return appointmentOperatorId === operatorId;
  }

  if (appointmentOperatorName && operatorName && appointmentOperatorName === operatorName) {
    return true;
  }

  return false;
};
