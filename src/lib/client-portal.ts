import { getServiceDuration, normalizeAvailabilitySettings, normalizeRoleName } from './booking';
import { normalizeWorkspace, type SalonWorkspace } from './platform';
import { normalizeServiceAccentKey } from './service-accents';
import { supabase } from './supabase';

export type ClientPortalSnapshot = {
  workspace: SalonWorkspace;
  clienti: Array<Record<string, unknown>>;
  appuntamenti: Array<Record<string, unknown>>;
  servizi: Array<Record<string, unknown>>;
  operatori: Array<Record<string, unknown>>;
  richiestePrenotazione: Array<Record<string, unknown>>;
  availabilitySettings: ReturnType<typeof normalizeAvailabilitySettings>;
  serviceCardColorOverrides?: Record<string, string>;
  roleCardColorOverrides?: Record<string, string>;
};

export type PublicBookingOccupancyItem = {
  id: string;
  data: string;
  ora: string;
  cliente: string;
  servizio: string;
  prezzo: number;
  durataMinuti?: number;
  operatoreId?: string;
  operatoreNome?: string;
  macchinarioIds?: string[];
  macchinarioNomi?: string[];
};

const CLIENT_PORTAL_RPC_TIMEOUT_MS = 8000;

const normalizeNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const normalizeStringIdArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .filter((item, index, array) => array.indexOf(item) === index)
    : [];

const normalizeColorOverrideMap = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (accumulator, [key, entryValue]) => {
      const normalizedKey = String(key ?? '').trim();
      const normalizedValue = String(entryValue ?? '').trim();
      if (!normalizedKey || !normalizedValue) {
        return accumulator;
      }
      accumulator[normalizedKey] = normalizedValue;
      return accumulator;
    },
    {}
  );
};

const normalizeServiceColorOverrideMap = (value: unknown): Record<string, string> => {
  const rawOverrides = normalizeColorOverrideMap(value);
  const next: Record<string, string> = {};

  Object.entries(rawOverrides).forEach(([key, entryValue]) => {
    const normalizedKey = normalizeServiceAccentKey(key);
    if (!normalizedKey) {
      return;
    }

    next[normalizedKey] = entryValue;
  });

  return next;
};

const normalizeRoleColorOverrideMap = (value: unknown): Record<string, string> => {
  const rawOverrides = normalizeColorOverrideMap(value);
  const next: Record<string, string> = {};

  Object.entries(rawOverrides).forEach(([key, entryValue]) => {
    const normalizedKey = normalizeRoleName(key);
    if (!normalizedKey) {
      return;
    }

    next[normalizedKey] = entryValue;
  });

  return next;
};

const normalizeAppointmentRecord = (item: Record<string, any>) => ({
  id:
    String(item.id ?? '').trim() ||
    `appointment-${String(item.ora ?? item.appointment_time ?? '').trim()}`,
  data: String(item.data ?? item.appointment_date ?? '').trim(),
  ora: String(item.ora ?? item.appointment_time ?? '').trim(),
  cliente: String(item.cliente ?? item.customer_name ?? '').trim(),
  servizio: String(item.servizio ?? item.service_name ?? item.requested_service_name ?? '').trim(),
  prezzo: normalizeNumber(item.prezzo ?? item.price ?? item.requested_price) ?? 0,
  durataMinuti: normalizeNumber(item.durataMinuti ?? item.duration_minutes),
  operatoreId: String(item.operatoreId ?? item.operator_id ?? '').trim() || undefined,
  operatoreNome: String(item.operatoreNome ?? item.operator_name ?? '').trim() || undefined,
  macchinarioIds: normalizeStringIdArray(item.macchinarioIds ?? item.machinery_ids),
  macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi ?? item.machinery_names),
});

const normalizeRequestRecord = (item: Record<string, any>) => ({
  id: String(item.id ?? '').trim(),
  data: String(item.data ?? item.appointment_date ?? '').trim(),
  ora: String(item.ora ?? item.appointment_time ?? '').trim(),
  servizio: String(item.servizio ?? item.requested_service_name ?? '').trim(),
  prezzo: normalizeNumber(item.prezzo ?? item.requested_price) ?? 0,
  durataMinuti: normalizeNumber(item.durataMinuti ?? item.requested_duration_minutes),
  nome: String(item.nome ?? item.customer_name ?? '').trim(),
  cognome: String(item.cognome ?? item.customer_surname ?? '').trim(),
  email: String(item.email ?? item.customer_email ?? '').trim(),
  telefono: String(item.telefono ?? item.customer_phone ?? '').trim(),
  instagram: String(item.instagram ?? item.customer_instagram ?? '').trim(),
  note: String(item.note ?? item.notes ?? '').trim(),
  operatoreId:
    String(item.operatoreId ?? item.operator_id ?? item.requested_operator_id ?? '').trim() ||
    undefined,
  operatoreNome:
    String(item.operatoreNome ?? item.operator_name ?? item.requested_operator_name ?? '').trim() ||
    undefined,
  macchinarioIds: normalizeStringIdArray(item.macchinarioIds ?? item.machinery_ids),
  macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi ?? item.machinery_names),
  origine: item.origine ?? item.origin,
  stato: String(item.stato ?? item.status ?? '').trim(),
  createdAt: String(item.createdAt ?? item.created_at ?? '').trim(),
  viewedByCliente: item.viewedByCliente ?? item.viewed_by_customer,
  viewedBySalon: item.viewedBySalon ?? item.viewed_by_salon,
});

const normalizeServiceRecord = (item: Record<string, any>) => ({
  ...item,
  id: String(item.id ?? '').trim(),
  nome: String(item.nome ?? item.name ?? '').trim(),
  prezzo: normalizeNumber(item.prezzo ?? item.price) ?? 0,
  durataMinuti: normalizeNumber(item.durataMinuti ?? item.duration_minutes),
  mestiereRichiesto: String(item.mestiereRichiesto ?? item.required_role ?? '').trim(),
  macchinarioIds: normalizeStringIdArray(item.macchinarioIds ?? item.machinery_ids),
});

const normalizePortalSnapshot = (data: Record<string, any> | null): ClientPortalSnapshot | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const workspace = normalizeWorkspace(data.workspace ?? null, data.workspace?.ownerEmail ?? '');

  return {
    workspace,
    clienti: Array.isArray(data.clienti) ? data.clienti : [],
    appuntamenti: Array.isArray(data.appuntamenti)
      ? data.appuntamenti
          .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
          .map(normalizeAppointmentRecord)
      : [],
    servizi: Array.isArray(data.servizi)
      ? data.servizi
          .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
          .map(normalizeServiceRecord)
      : [],
    operatori: Array.isArray(data.operatori) ? data.operatori : [],
    richiestePrenotazione: Array.isArray(data.richiestePrenotazione)
      ? data.richiestePrenotazione
          .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
          .map(normalizeRequestRecord)
      : [],
    availabilitySettings: normalizeAvailabilitySettings(data.availabilitySettings ?? {}),
    serviceCardColorOverrides: normalizeServiceColorOverrideMap(data.serviceCardColorOverrides),
    roleCardColorOverrides: normalizeRoleColorOverrideMap(data.roleCardColorOverrides),
  };
};

export const fetchClientPortalSnapshot = async (salonCode: string) => {
  const rpcTask = Promise.resolve(
    supabase.rpc('get_client_portal_snapshot', {
      p_salon_code: salonCode,
    })
  );
  const timeoutTask = new Promise<never>((_, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('client_portal_snapshot_timeout'));
    }, CLIENT_PORTAL_RPC_TIMEOUT_MS);

    rpcTask.finally(() => clearTimeout(timer)).catch(() => undefined);
  });

  const { data, error } = await Promise.race([rpcTask, timeoutTask]);

  if (error) {
    throw error;
  }

  return normalizePortalSnapshot((data ?? null) as Record<string, any> | null);
};

export const derivePublicBookingOccupancyFromSnapshot = (
  snapshot: ClientPortalSnapshot | null,
  dateValue: string
): PublicBookingOccupancyItem[] => {
  if (!snapshot) {
    return [];
  }

  const appointments = Array.isArray(snapshot.appuntamenti) ? snapshot.appuntamenti : [];
  const services = Array.isArray(snapshot.servizi) ? snapshot.servizi : [];
  const requests = Array.isArray(snapshot.richiestePrenotazione)
    ? snapshot.richiestePrenotazione
    : [];

  const normalizedAppointments = appointments
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
    .filter((item) => String(item.data ?? '').trim() === dateValue)
    .map((item) => ({
      id: String(item.id ?? `appointment-${String(item.ora ?? '').trim()}`),
      data: dateValue,
      ora: String(item.ora ?? '').trim(),
      cliente: String(item.cliente ?? '').trim(),
      servizio: String(item.servizio ?? '').trim(),
      prezzo: Number(item.prezzo ?? 0),
      durataMinuti:
        typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(String(item.servizio ?? '').trim(), services as any[]),
      operatoreId: String(item.operatoreId ?? '').trim() || undefined,
      operatoreNome: String(item.operatoreNome ?? '').trim() || undefined,
      macchinarioIds: normalizeStringIdArray(item.macchinarioIds),
      macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi),
    }))
    .filter((item) => item.ora && item.servizio);

  const appointmentKeys = new Set(
    normalizedAppointments.map((item) =>
      [item.data, item.ora.toLowerCase(), item.cliente.toLowerCase(), item.servizio.toLowerCase()].join('|')
    )
  );

  const materializedRequests = requests
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
    .filter((item) => String(item.data ?? '').trim() === dateValue)
    .filter((item) => {
      const stato = String(item.stato ?? '').trim();
      return stato === 'In attesa' || stato === 'Accettata';
    })
    .filter((item) => {
      const stato = String(item.stato ?? '').trim();
      if (stato !== 'Accettata') {
        return true;
      }

      const requestKey = [
        dateValue,
        String(item.ora ?? '').trim().toLowerCase(),
        `${String(item.nome ?? '').trim()} ${String(item.cognome ?? '').trim()}`
          .trim()
          .toLowerCase(),
        String(item.servizio ?? '').trim().toLowerCase(),
      ].join('|');

      return !appointmentKeys.has(requestKey);
    })
    .map((item) => ({
      id: `${String(item.stato ?? '').trim() === 'Accettata' ? 'accepted' : 'pending'}-${String(item.id ?? '').trim()}`,
      data: dateValue,
      ora: String(item.ora ?? '').trim(),
      cliente: `${String(item.nome ?? '').trim()} ${String(item.cognome ?? '').trim()}`.trim(),
      servizio: String(item.servizio ?? '').trim(),
      prezzo: Number(item.prezzo ?? 0),
      durataMinuti:
        typeof item.durataMinuti === 'number'
          ? item.durataMinuti
          : getServiceDuration(String(item.servizio ?? '').trim(), services as any[]),
      operatoreId:
        String(item.operatoreId ?? item.operator_id ?? item.requested_operator_id ?? '').trim() ||
        undefined,
      operatoreNome:
        String(item.operatoreNome ?? item.operator_name ?? item.requested_operator_name ?? '').trim() ||
        undefined,
      macchinarioIds: normalizeStringIdArray(item.macchinarioIds),
      macchinarioNomi: normalizeStringIdArray(item.macchinarioNomi),
    }))
    .filter((item) => item.ora && item.servizio);

  return [...normalizedAppointments, ...materializedRequests];
};

export const fetchPublicBookingOccupancy = async (
  salonCode: string,
  dateValue: string
): Promise<PublicBookingOccupancyItem[]> => {
  const snapshot = await fetchClientPortalSnapshot(salonCode);
  return derivePublicBookingOccupancyFromSnapshot(snapshot, dateValue);
};

export const publishClientPortalSnapshot = async (snapshot: ClientPortalSnapshot) => {
  const payload = {
    workspace: {
      id: snapshot.workspace.id,
      ownerEmail: snapshot.workspace.ownerEmail,
      salonCode: snapshot.workspace.salonCode,
      salonName: snapshot.workspace.salonName,
      salonNameDisplayStyle: snapshot.workspace.salonNameDisplayStyle,
      salonNameFontVariant: snapshot.workspace.salonNameFontVariant,
      businessPhone: snapshot.workspace.businessPhone,
      activityCategory: snapshot.workspace.activityCategory,
      salonAddress: snapshot.workspace.salonAddress,
      streetType: snapshot.workspace.streetType,
      streetName: snapshot.workspace.streetName,
      streetNumber: snapshot.workspace.streetNumber,
      city: snapshot.workspace.city,
      postalCode: snapshot.workspace.postalCode,
      subscriptionPlan: snapshot.workspace.subscriptionPlan,
      subscriptionStatus: snapshot.workspace.subscriptionStatus,
      customerReminderHoursBefore: snapshot.workspace.customerReminderHoursBefore,
      createdAt: snapshot.workspace.createdAt,
      updatedAt: snapshot.workspace.updatedAt,
    },
    clienti: snapshot.clienti,
    appuntamenti: snapshot.appuntamenti,
    servizi: snapshot.servizi,
    operatori: snapshot.operatori,
    richiestePrenotazione: snapshot.richiestePrenotazione,
    availabilitySettings: snapshot.availabilitySettings,
    serviceCardColorOverrides: snapshot.serviceCardColorOverrides ?? {},
    roleCardColorOverrides: snapshot.roleCardColorOverrides ?? {},
  };

  const { data, error } = await supabase.rpc('upsert_client_portal_snapshot', {
    p_payload: payload,
  });

  if (error) {
    throw error;
  }

  return typeof data === 'string' ? data : null;
};
