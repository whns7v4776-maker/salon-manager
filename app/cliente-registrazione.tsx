import { Redirect, useLocalSearchParams, type Href } from 'expo-router';
import React from 'react';

export default function ClienteRegistrationScreen() {
  const searchParams = useLocalSearchParams<{
    salon?: string | string[];
    code?: string | string[];
  }>();
  const salon = Array.isArray(searchParams.salon) ? searchParams.salon[0] : searchParams.salon;
  const code = Array.isArray(searchParams.code) ? searchParams.code[0] : searchParams.code;

  return (
    <Redirect
      href={
        {
          pathname: '/',
          params: {
            side: 'client',
            salon: salon || code || undefined,
            mode: 'register',
            registrationOnly: '1',
          },
        } as Href
      }
    />
  );
}
