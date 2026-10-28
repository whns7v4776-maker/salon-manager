import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import React, { useMemo } from 'react';
import ClienteScreen from './cliente-screen';

export default function ClienteRouteGuardScreen() {
  const searchParams = useLocalSearchParams<{
    salon?: string | string[];
    code?: string | string[];
    mode?: string | string[];
    autologin?: string | string[];
    biometric?: string | string[];
    registrationOnly?: string | string[];
    email?: string | string[];
    phone?: string | string[];
  }>();

  const salon = Array.isArray(searchParams.salon) ? searchParams.salon[0] : searchParams.salon;
  const code = Array.isArray(searchParams.code) ? searchParams.code[0] : searchParams.code;
  const mode = Array.isArray(searchParams.mode) ? searchParams.mode[0] : searchParams.mode;
  const autologin = Array.isArray(searchParams.autologin)
    ? searchParams.autologin[0]
    : searchParams.autologin;
  const biometric = Array.isArray(searchParams.biometric)
    ? searchParams.biometric[0]
    : searchParams.biometric;
  const registrationOnly = Array.isArray(searchParams.registrationOnly)
    ? searchParams.registrationOnly[0]
    : searchParams.registrationOnly;
  const email = Array.isArray(searchParams.email) ? searchParams.email[0] : searchParams.email;
  const phone = Array.isArray(searchParams.phone) ? searchParams.phone[0] : searchParams.phone;

  const resolvedSalonCode = useMemo(
    () => String(salon || code || '').trim(),
    [salon, code]
  );

  const canOpenDedicatedClientRoute = useMemo(
    () =>
      autologin === '1' ||
      biometric === '1' ||
      registrationOnly === '1' ||
      (mode === 'booking' && Boolean(resolvedSalonCode)) ||
      Boolean(String(email ?? '').trim()) ||
      Boolean(String(phone ?? '').trim()),
    [autologin, biometric, registrationOnly, mode, resolvedSalonCode, email, phone]
  );

  if (!canOpenDedicatedClientRoute) {
    return (
      <Redirect
        href={
          {
            pathname: '/',
            params: {
              salon: salon || code || undefined,
              side: 'client',
            },
          } as Href
        }
      />
    );
  }

  return <ClienteScreen />;
}
