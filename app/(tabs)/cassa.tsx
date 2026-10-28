import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { CassaScreen } from '../cassa-screen';
export default function CashTab() {
  const active = useIsFocused();
  return <CassaScreen active={active} />;
}
