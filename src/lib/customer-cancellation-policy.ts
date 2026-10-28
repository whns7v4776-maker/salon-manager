export const ACCEPTED_APPOINTMENT_CANCELLATION_NOTICE_MINUTES = 30;

const ACCEPTED_APPOINTMENT_CANCELLATION_NOTICE_MS =
  ACCEPTED_APPOINTMENT_CANCELLATION_NOTICE_MINUTES * 60 * 1000;

const parseLocalAppointmentStartMs = (
  appointmentDate: string,
  appointmentTime: string,
) => {
  const dateMatch = appointmentDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = appointmentTime
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,6})?)?$/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  const appointmentStart = new Date(year, month - 1, day, hour, minute, second, 0);

  // Date normalizza silenziosamente valori impossibili (per esempio 31/02).
  // Il round-trip mantiene chiusa la policy anche davanti a dati non validi.
  if (
    appointmentStart.getFullYear() !== year ||
    appointmentStart.getMonth() !== month - 1 ||
    appointmentStart.getDate() !== day ||
    appointmentStart.getHours() !== hour ||
    appointmentStart.getMinutes() !== minute ||
    appointmentStart.getSeconds() !== second
  ) {
    return null;
  }

  return appointmentStart.getTime();
};

export const getAcceptedAppointmentCancellationCutoffMs = (
  appointmentDate: string,
  appointmentTime: string,
  noticeMinutes = ACCEPTED_APPOINTMENT_CANCELLATION_NOTICE_MINUTES,
) => {
  const appointmentStartMs = parseLocalAppointmentStartMs(
    appointmentDate,
    appointmentTime,
  );

  return appointmentStartMs === null
    ? null
    : appointmentStartMs - (Number.isInteger(noticeMinutes) && noticeMinutes >= 0 && noticeMinutes <= 10080 ? noticeMinutes : 30) * 60000;
};

export const canCancelAcceptedAppointment = (
  appointmentDate: string,
  appointmentTime: string,
  nowMs = Date.now(),
  noticeMinutes = ACCEPTED_APPOINTMENT_CANCELLATION_NOTICE_MINUTES,
) => {
  if (!Number.isFinite(nowMs)) {
    return false;
  }

  const cutoffMs = getAcceptedAppointmentCancellationCutoffMs(
    appointmentDate,
    appointmentTime,
    noticeMinutes,
  );

  // A T-30 il termine e raggiunto: l'annullamento deve avvenire prima.
  return cutoffMs !== null && nowMs < cutoffMs;
};

export const cancellationNoticeLabel = (minutes: number) => minutes === 0 ? 'prima dell’inizio dell’appuntamento' : `almeno ${minutes % 1440 === 0 ? `${minutes / 1440} ${minutes === 1440 ? 'giorno' : 'giorni'}` : minutes % 60 === 0 ? `${minutes / 60} ${minutes === 60 ? 'ora' : 'ore'}` : `${minutes} minuti`} prima dell’appuntamento`;
