import React from 'react';
import { useIsFocused } from '@react-navigation/native';
import { ImpostazioniScreen } from '../impostazioni';
export default function SettingsTab() {
 const active = useIsFocused();
 return <ImpostazioniScreen embeddedInTabs active={active} />;
}
