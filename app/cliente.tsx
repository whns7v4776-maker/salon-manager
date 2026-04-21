import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

type SearchParamValue = string | string[] | undefined;

const firstParam = (value: SearchParamValue) => (Array.isArray(value) ? value[0] : value);

export default function ClienteScreenRedirect() {
  const params = useLocalSearchParams<{
    salon?: SearchParamValue;
    email?: SearchParamValue;
    phone?: SearchParamValue;
    autologin?: SearchParamValue;
    mode?: SearchParamValue;
    biometric?: SearchParamValue;
    registrationOnly?: SearchParamValue;
  }>();

  return (
    <Redirect
      href={
        {
          pathname: '/cliente-screen',
          params: {
            salon: firstParam(params.salon),
            email: firstParam(params.email),
            phone: firstParam(params.phone),
            autologin: firstParam(params.autologin),
            mode: firstParam(params.mode),
            biometric: firstParam(params.biometric),
            registrationOnly: firstParam(params.registrationOnly),
          },
        } satisfies Href
      }
    />
  );
}
