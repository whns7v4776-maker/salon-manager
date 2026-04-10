# Home

File sorgente: `app/(tabs)/index.tsx`

```tsx
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../../src/lib/supabase';

type Salon = {
  id: string;
  name: string;
  owner_user_id: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  is_active: boolean | null;
};

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [salonId, setSalonId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('Italia');

  const loginTest = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email: 'marziomus@icloud.com',
      password: '12345678',
    });

    if (error) {
      Alert.alert('Errore login', error.message);
      return;
    }

    Alert.alert('Login OK');
    await caricaMioSalone();
  };

  const caricaMioSalone = async () => {
    try {
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setUserId(null);
        setSalonId(null);
        setLoading(false);
        Alert.alert('Errore', 'Utente non loggato');
        return;
      }

      setUserId(user.id);

      const { data, error } = await supabase
        .from('salons')
        .select('*')
        .eq('owner_user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        setLoading(false);
        Alert.alert('Errore caricamento', error.message);
        return;
      }

      if (!data) {
        setSalonId(null);
        setName('');
        setPhone('');
        setEmail('');
        setAddress('');
        setCity('');
        setCountry('Italia');
        setLoading(false);
        return;
      }

      const salon = data as Salon;

      setSalonId(salon.id);
      setName(salon.name ?? '');
      setPhone(salon.phone ?? '');
      setEmail(salon.email ?? '');
      setAddress(salon.address ?? '');
      setCity(salon.city ?? '');
      setCountry(salon.country ?? 'Italia');
      setLoading(false);
    } catch (e: any) {
      setLoading(false);
      Alert.alert('Errore generale', e.message);
    }
  };

  const salvaSalone = async () => {
    try {
      if (!userId) {
        Alert.alert('Errore', 'Devi prima fare login');
        return;
      }

      if (!name.trim()) {
        Alert.alert('Errore', 'Inserisci il nome del salone');
        return;
      }

      setSaving(true);

      if (salonId) {
        const { error } = await supabase
          .from('salons')
          .update({
            name: name.trim(),
            phone: phone.trim() || null,
            email: email.trim() || null,
            address: address.trim() || null,
            city: city.trim() || null,
            country: country.trim() || null,
          })
          .eq('id', salonId)
          .eq('owner_user_id', userId);

        setSaving(false);

        if (error) {
          Alert.alert('Errore aggiornamento', error.message);
          return;
        }

        Alert.alert('OK', 'Salone aggiornato con successo');
        await caricaMioSalone();
        return;
      }

      const { data, error } = await supabase
        .from('salons')
        .insert([
          {
            name: name.trim(),
            owner_user_id: userId,
            phone: phone.trim() || null,
            email: email.trim() || null,
            address: address.trim() || null,
            city: city.trim() || null,
            country: country.trim() || null,
            is_active: true,
          },
        ])
        .select()
        .single();

      setSaving(false);

      if (error) {
        Alert.alert('Errore creazione', error.message);
        return;
      }

      setSalonId(data.id);
      Alert.alert('OK', 'Salone creato con successo');
      await caricaMioSalone();
    } catch (e: any) {
      setSaving(false);
      Alert.alert('Errore generale', e.message);
    }
  };

useEffect(() => {
  const init = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      Alert.alert('Non loggato', 'Fai login prima');
      return;
    }

    await caricaMioSalone();
  };

  init();
}, []);

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Caricamento...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        <Text style={{ fontSize: 28, fontWeight: '700', textAlign: 'center' }}>
          Il mio salone
        </Text>

        <Button title="Login test" onPress={loginTest} />
        <Button title="Ricarica dati" onPress={caricaMioSalone} />

        <View style={{ gap: 12, marginTop: 8 }}>
          <Text style={{ fontWeight: '600' }}>Nome salone</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Es. SalonPro Bergamo"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: '#fff',
            }}
          />

          <Text style={{ fontWeight: '600' }}>Telefono</Text>
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="Es. 3331234567"
            keyboardType="phone-pad"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: '#fff',
            }}
          />

          <Text style={{ fontWeight: '600' }}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Es. info@salone.it"
            keyboardType="email-address"
            autoCapitalize="none"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: '#fff',
            }}
          />

          <Text style={{ fontWeight: '600' }}>Indirizzo</Text>
          <TextInput
            value={address}
            onChangeText={setAddress}
            placeholder="Es. Via Roma 1"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: '#fff',
            }}
          />

          <Text style={{ fontWeight: '600' }}>Città</Text>
          <TextInput
            value={city}
            onChangeText={setCity}
            placeholder="Es. Bergamo"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: '#fff',
            }}
          />

          <Text style={{ fontWeight: '600' }}>Paese</Text>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder="Es. Italia"
            style={{
              borderWidth: 1,
              borderColor: '#ccc',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 12,
              backgroundColor: '#fff',
            }}
          />
        </View>

        <Button
          title={saving ? 'Salvataggio...' : salonId ? 'Aggiorna salone' : 'Crea salone'}
          onPress={salvaSalone}
          disabled={saving}
        />

        <Text style={{ textAlign: 'center', marginTop: 8 }}>
          {salonId ? `ID salone: ${salonId}` : 'Nessun salone ancora creato'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
```

# Clienti

File sorgente: `app/(tabs)/clienti.tsx`

```tsx
import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { useAppContext } from '../../src/context/AppContext';
import { supabase } from '../../src/lib/supabase';
import { useResponsiveLayout } from '../../src/lib/responsive';

type ClienteItem = {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  birthday?: string | null;
  is_active?: boolean;
  salon_id: string;
};

export default function ClientiScreen() {
  const responsive = useResponsiveLayout();
  const { salonWorkspace, appLanguage } = useAppContext();

  const [clienti, setClienti] = useState<ClienteItem[]>([]);
  const [nome, setNome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [salonId, setSalonId] = useState<string | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      setLoadingInit(true);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        Alert.alert('Errore', 'Non loggato');
        setLoadingInit(false);
        return;
      }

      const { data: salone, error: saloneError } = await supabase
        .from('salons')
        .select('id')
        .eq('owner_user_id', session.user.id)
        .limit(1)
        .maybeSingle();

      if (saloneError || !salone) {
        Alert.alert('Errore', 'Salone non trovato');
        setLoadingInit(false);
        return;
      }

      setSalonId(salone.id);
      await caricaClienti(salone.id);
      setLoadingInit(false);
    } catch (e: any) {
      Alert.alert('Errore init', e.message);
      setLoadingInit(false);
    }
  };

  const caricaClienti = async (id: string) => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('salon_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      Alert.alert('Errore', error.message);
      return;
    }

    setClienti((data as ClienteItem[]) || []);
  };

  const aggiungiCliente = async () => {
    if (!nome.trim() || !telefono.trim()) {
      Alert.alert('Errore', 'Compila nome e telefono');
      return;
    }

    if (!salonId) {
      Alert.alert('Errore', 'Salone non caricato ancora');
      return;
    }

    try {
      setSaving(true);

      const { error } = await supabase.from('clients').insert([
        {
          full_name: nome.trim(),
          phone: telefono.trim(),
          salon_id: salonId,
        },
      ]);

      setSaving(false);

      if (error) {
        Alert.alert('Errore inserimento', error.message);
        return;
      }

      setNome('');
      setTelefono('');
      await caricaClienti(salonId);
      Alert.alert('OK', 'Cliente aggiunto');
    } catch (e: any) {
      setSaving(false);
      Alert.alert('Errore generale', e.message);
    }
  };

  const eliminaCliente = async (id: string) => {
    Alert.alert('Conferma', 'Vuoi eliminare questo cliente?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('clients').delete().eq('id', id);

          if (error) {
            Alert.alert('Errore', error.message);
            return;
          }

          if (salonId) {
            await caricaClienti(salonId);
          }
        },
      },
    ]);
  };

  const renderClienteCard = (item: ClienteItem) => (
    <View style={styles.clienteCard}>
      <View style={styles.clienteMain}>
        <View style={styles.clienteInitialBadge}>
          <Text style={styles.clienteInitialText}>
            {(item.full_name?.trim()?.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>

        <View style={styles.clienteInfo}>
          <Text style={styles.clienteNome} numberOfLines={1}>
            {item.full_name}
          </Text>
          <Text style={styles.clienteTelefono}>{item.phone}</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => eliminaCliente(item.id)}
        activeOpacity={0.9}
        style={styles.deleteButton}
      >
        <Text style={styles.deleteButtonText}>Elimina</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={clienti}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="clienti"
                title="Clienti"
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
                subtitle="Gestisci i clienti del tuo salone, aggiungili rapidamente e tieni tutto ordinato."
              />
            </View>

            <View style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <View style={styles.bookingHeaderLeft}>
                  <View style={styles.bookingHeadingRow}>
                    <Text
                      style={styles.bookingHeading}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.86}
                    >
                      Nuovo cliente
                    </Text>
                  </View>
                  <Text style={styles.searchSubtitle}>
                    {loadingInit
                      ? 'Caricamento salone...'
                      : 'Aggiungi un cliente e salvalo direttamente nel database.'}
                  </Text>
                </View>

                <View style={styles.bookingBadge}>
                  <Text style={styles.bookingBadgeText}>{clienti.length} clienti</Text>
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Nome cliente</Text>
                <TextInput
                  placeholder="Inserisci nome e cognome"
                  placeholderTextColor="#8f8f8f"
                  value={nome}
                  onChangeText={setNome}
                  editable={!saving && !loadingInit}
                  style={styles.input}
                />
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Telefono</Text>
                <TextInput
                  placeholder="Inserisci numero di telefono"
                  placeholderTextColor="#8f8f8f"
                  value={telefono}
                  onChangeText={setTelefono}
                  editable={!saving && !loadingInit}
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, (saving || loadingInit) && styles.primaryButtonDisabled]}
                onPress={aggiungiCliente}
                activeOpacity={0.9}
                disabled={saving || loadingInit}
              >
                <Text style={styles.primaryButtonText}>
                  {saving ? 'Salvataggio...' : 'Aggiungi cliente'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchCard}>
              <Text style={styles.searchTitle}>Rubrica clienti</Text>
              <Text style={styles.searchSubtitle}>
                Qui trovi tutti i clienti collegati al tuo salone.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          !loadingInit ? (
            <View style={[styles.emptyCard, { maxWidth: responsive.contentMaxWidth, alignSelf: 'center' }]}>
              <Text style={styles.emptyTitle}>Nessun cliente presente</Text>
              <Text style={styles.emptyText}>
                Aggiungi il primo cliente usando il modulo qui sopra.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.pageShell, styles.daySectionCardShell, { maxWidth: responsive.contentMaxWidth }]}>
            {renderClienteCard(item)}
          </View>
        )}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#edf2f6',
  },
  listContent: {
    paddingTop: 54,
    paddingBottom: 140,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 30,
    paddingHorizontal: 22,
    paddingTop: 0,
    paddingBottom: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  bookingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bookingHeaderLeft: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 10,
  },
  bookingHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  bookingHeading: {
    flex: 1,
    fontSize: 17,
    fontWeight: '800',
    color: '#111111',
    letterSpacing: -0.3,
  },
  bookingBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexShrink: 0,
  },
  bookingBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4b5563',
  },
  sectionBlock: {
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'left',
    marginBottom: 10,
  },
  input: {
    backgroundColor: '#f5f5f4',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111111',
  },
  primaryButton: {
    backgroundColor: '#161616',
    borderRadius: 20,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2f2f2f',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  searchCard: {
    backgroundColor: '#f7fbff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d9e5f1',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    alignItems: 'stretch',
  },
  searchTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 8,
    textAlign: 'left',
  },
  searchSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    fontWeight: '600',
    textAlign: 'left',
  },
  daySectionCardShell: {
    width: '100%',
  },
  clienteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  clienteMain: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  clienteInitialBadge: {
    width: 46,
    height: 46,
    borderRadius: 999,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  clienteInitialText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  clienteInfo: {
    flex: 1,
  },
  clienteNome: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  clienteTelefono: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: '#fee2e2',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  deleteButtonText: {
    color: '#b91c1c',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    marginTop: 6,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 21,
    textAlign: 'center',
  },
});
```
