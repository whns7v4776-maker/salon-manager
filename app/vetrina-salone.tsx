import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DirectorySettings } from '../components/salon-discovery/directory-settings';
import { haptic } from '../src/lib/haptics';
import { useAppContext } from '../src/context/AppContext';
export default function SalonDirectoryScreen() {
  const { salonWorkspace } = useAppContext();
  const router = useRouter();
  return <SafeAreaView style={{ flex: 1, backgroundColor: '#f4f6fa' }}><Stack.Screen options={{ headerShown: false }} /><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 48, width: '100%', maxWidth: 850, alignSelf: 'center' }}><Pressable accessibilityRole="button" accessibilityLabel="Torna alle impostazioni" onPressIn={() => { if (Platform.OS !== 'web') void haptic.light().catch(() => {}); }} onPress={() => router.canGoBack() ? router.back() : router.replace('/impostazioni')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, marginBottom: 12, borderRadius: 16, backgroundColor: pressed && Platform.OS !== 'web' ? '#E1EEFF' : 'transparent' })}><Ionicons name="chevron-back" size={22} color="#334155" /><Text style={{ color: '#334155', fontSize: 16, fontWeight: '600' }}>Impostazioni</Text></Pressable><DirectorySettings key={salonWorkspace.id} workspace={salonWorkspace} /></ScrollView></SafeAreaView>;
}
