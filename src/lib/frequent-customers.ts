import { lowerItalian } from './italian-case';

type FrequencyCustomer = {
  id?: string | null;
  nome?: string | null;
  email?: string | null;
  telefono?: string | null;
};

type FrequencyAppointment = {
  customerId?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  cliente?: string | null;
};

const normalizeIdentity = (value?: string | null) =>
  lowerItalian(String(value ?? '').trim()).replace(/\s+/g, ' ');

const normalizePhone = (value?: string | null) =>
  String(value ?? '').replace(/[^0-9+]/g, '');

const buildCustomerIdentityKeys = (customer: FrequencyCustomer) =>
  [
    customer.id ? `id:${customer.id.trim()}` : '',
    customer.email ? `email:${normalizeIdentity(customer.email)}` : '',
    customer.telefono ? `phone:${normalizePhone(customer.telefono)}` : '',
    customer.nome ? `name:${normalizeIdentity(customer.nome)}` : '',
  ].filter(Boolean);

export const sortCustomersByAppointmentFrequency = <T extends FrequencyCustomer>(
  customers: T[],
  appointments: FrequencyAppointment[]
) => {
  const frequencyByKey = new Map<string, number>();

  appointments.forEach((appointment) => {
    const keys = [
      appointment.customerId ? `id:${appointment.customerId.trim()}` : '',
      appointment.customerEmail ? `email:${normalizeIdentity(appointment.customerEmail)}` : '',
      appointment.customerPhone ? `phone:${normalizePhone(appointment.customerPhone)}` : '',
      appointment.cliente ? `name:${normalizeIdentity(appointment.cliente)}` : '',
    ].filter(Boolean);
    keys.forEach((key) => frequencyByKey.set(key, (frequencyByKey.get(key) ?? 0) + 1));
  });

  const countForCustomer = (customer: T) =>
    Math.max(0, ...buildCustomerIdentityKeys(customer).map((key) => frequencyByKey.get(key) ?? 0));

  return [...customers].sort((left, right) => {
    const frequencyDifference = countForCustomer(right) - countForCustomer(left);
    if (frequencyDifference !== 0) return frequencyDifference;

    const nameDifference = normalizeIdentity(left.nome).localeCompare(
      normalizeIdentity(right.nome),
      'it',
      { sensitivity: 'base' }
    );
    if (nameDifference !== 0) return nameDifference;
    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });
};
