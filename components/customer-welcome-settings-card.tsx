import { NativeCustomerUtilityCard } from './native-customer-utility-card';
import { PremiumFitLabel } from './ui/premium-fit-label';
import { PremiumSectionHeader } from './ui/premium-section-heading';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumStyles, useCustomerPremiumColor } from './owner-premium-customers-style';

import React, { useEffect, useState } from 'react';
import { Appearance } from './access-appearance-context';
import { CustomerPopupSkin } from './customer-popup-skin';
import { NativeMedal } from './owner-premium-native-home';
import { Alert, Keyboard, Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { CreationSheet } from './creation-sheet';
import type { SalonWorkspace } from '../src/lib/platform';
import { supabase } from '../src/lib/supabase';
import { HapticTouchable } from './ui/haptic-touchable';
import { PremiumExpandButton } from './ui/premium-expand-button';

const DEFAULT_WELCOME_TITLE = 'Benvenuto da {salone}!';
const DEFAULT_WELCOME_MESSAGE =
  'Ciao {nome}, siamo felici di averti con noi. Da qui puoi consultare i servizi e prenotare i tuoi appuntamenti.';

/** Skinned editor popup; the page card itself keeps the page palette (`outerAppearance`). */
export function CustomerWelcomeSettingsCard(props: Omit<React.ComponentProps<typeof CustomerWelcomeSettingsCardBody>, 'outerAppearance'>) {
  const outerAppearance = React.useContext(Appearance);
  return <CustomerPopupSkin><CustomerWelcomeSettingsCardBody {...props} outerAppearance={outerAppearance} /></CustomerPopupSkin>;
}
function CustomerWelcomeSettingsCardBody({
  outerAppearance,
  workspace,
  ready,
  wideWebLayout = false,
  onSave,
}: {
  outerAppearance: React.ContextType<typeof Appearance>;
  workspace: SalonWorkspace;
  ready: boolean;
  wideWebLayout?: boolean;
  onSave: (
    updater: (current: SalonWorkspace) => SalonWorkspace
  ) => Promise<void>;
}) {
 const premiumColor=useCustomerPremiumColor();
 const baseStyles=useCustomerPremiumStyles(baseCustomerComponentStyles);
 const pal=React.useContext(Appearance).palette;
 // Editor skin: defined switch, bronze primary action, notification-like preview.
 const bronze=pal.night?'#9C8461':'#6F5A3E';
 const styles=React.useMemo(()=>({...baseStyles,
  toggleRow:{...baseStyles.toggleRow,backgroundColor:pal.field,borderColor:pal.border,borderWidth:1},
  toggleRowActive:{backgroundColor:pal.night?'rgba(156,132,97,.12)':'rgba(122,100,70,.08)',borderColor:pal.night?'rgba(216,194,155,.4)':'rgba(111,90,62,.35)'},
  toggle:{width:50,height:30,borderRadius:15,padding:3,justifyContent:'center' as const,backgroundColor:pal.night?'#3A3D3E':'#D8CFC2'},
  toggleActive:{backgroundColor:bronze},
  toggleKnob:{width:24,height:24,borderRadius:12,backgroundColor:'#FFFDF8',shadowColor:'#000',shadowOpacity:.22,shadowRadius:3,shadowOffset:{width:0,height:1}},
  toggleKnobActive:{alignSelf:'flex-end' as const},
  saveButton:{...baseStyles.saveButton,backgroundColor:bronze,borderWidth:0,borderRadius:14,minHeight:50,justifyContent:'center' as const},
  saveButtonDisabled:{backgroundColor:'transparent',borderWidth:1,borderColor:pal.border,opacity:1},
  saveButtonText:{...baseStyles.saveButtonText,color:'#FFF8EC',fontWeight:'600' as const},
 }) as unknown as typeof baseStyles & Record<string,any>,[baseStyles,pal,bronze]);

  const [enabled, setEnabled] = useState(workspace.clientWelcomeEnabled !== false);
  const [title, setTitle] = useState(
    workspace.clientWelcomeTitle?.trim() || DEFAULT_WELCOME_TITLE
  );
  const [message, setMessage] = useState(
    workspace.clientWelcomeMessage?.trim() || DEFAULT_WELCOME_MESSAGE
  );
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const scrollRef = React.useRef<ScrollView | null>(null);
  const contentRef = React.useRef<View | null>(null);
  const focusedRef = React.useRef<TextInput | null>(null);
  const titleRef = React.useRef<TextInput | null>(null);
  const messageRef = React.useRef<TextInput | null>(null);
  const revealFocusedField = React.useCallback(() => {
    if (Platform.OS === 'web') return;
    requestAnimationFrame(() => {
      const input = focusedRef.current;
      const content = contentRef.current;
      if (!input?.isFocused() || !content) return;
      input.measureLayout(content, (_x, y) => {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: false });
      }, () => {});
    });
  }, []);
  const closeEditor = () => {
    if (saving) return;
    Keyboard.dismiss();
    setExpanded(false);
  };
  const toggleExpanded = React.useCallback(() => {
    setExpanded((current) => !current);
  }, []);

  useEffect(() => {
    if (saving) return;
    setEnabled(workspace.clientWelcomeEnabled !== false);
    setTitle(workspace.clientWelcomeTitle?.trim() || DEFAULT_WELCOME_TITLE);
    setMessage(workspace.clientWelcomeMessage?.trim() || DEFAULT_WELCOME_MESSAGE);
  }, [
    saving,
    workspace.clientWelcomeEnabled,
    workspace.clientWelcomeMessage,
    workspace.clientWelcomeTitle,
  ]);

  const normalizedTitle = title.trim();
  const normalizedMessage = message.trim();
  const hasChanges =
    enabled !== (workspace.clientWelcomeEnabled !== false) ||
    normalizedTitle !==
      (workspace.clientWelcomeTitle?.trim() || DEFAULT_WELCOME_TITLE) ||
    normalizedMessage !==
      (workspace.clientWelcomeMessage?.trim() || DEFAULT_WELCOME_MESSAGE);
  const canSave =
    ready &&
    !saving &&
    hasChanges &&
    normalizedTitle.length >= 2 &&
    normalizedMessage.length >= 2;

  const save = async () => {
    if (!canSave) return;

    setSaving(true);
    try {
      await onSave((current) => ({
        ...current,
        clientWelcomeEnabled: enabled,
        clientWelcomeTitle: normalizedTitle,
        clientWelcomeMessage: normalizedMessage,
      }));

      const workspaceId = workspace.id?.trim() ?? '';
      const normalizedOwnerEmail = workspace.ownerEmail?.trim().toLowerCase() ?? '';
      const normalizedSalonCode = workspace.salonCode?.trim().toLowerCase() ?? '';
      let confirmationQuery = supabase
        .from('workspaces')
        .select('client_welcome_enabled, client_welcome_title, client_welcome_message')
        .limit(1);

      if (workspaceId) {
        confirmationQuery = confirmationQuery.eq('id', workspaceId);
      } else if (normalizedOwnerEmail && normalizedSalonCode) {
        confirmationQuery = confirmationQuery
          .eq('owner_email', normalizedOwnerEmail)
          .eq('slug', normalizedSalonCode)
          .order('updated_at', { ascending: false });
      } else {
        throw new Error('workspace_identity_required');
      }

      const { data: confirmedWorkspace, error: confirmationError } =
        await confirmationQuery.maybeSingle();
      if (confirmationError) {
        throw confirmationError;
      }

      if (
        !confirmedWorkspace ||
        confirmedWorkspace.client_welcome_enabled !== enabled ||
        confirmedWorkspace.client_welcome_title?.trim() !== normalizedTitle ||
        confirmedWorkspace.client_welcome_message?.trim() !== normalizedMessage
      ) {
        throw new Error('customer_welcome_not_persisted');
      }

      Alert.alert(
        'Benvenuto aggiornato',
        'Il nuovo messaggio verrà mostrato ai clienti dopo la loro registrazione.'
      );
    } catch (error) {
      console.log('Errore salvataggio benvenuto cliente:', error);
      Alert.alert(
        'Salvataggio non riuscito',
        'Non sono riuscito ad aggiornare il messaggio di benvenuto.'
      );
    } finally {
      setSaving(false);
    }
  };

  const editor = (
        <View ref={contentRef} collapsable={false} style={[styles.editor, Platform.OS !== 'web' && styles.modalEditor]}>
          <HapticTouchable
            accessibilityRole="switch"
            accessibilityLabel="Mostra il benvenuto"
            accessibilityState={{checked:enabled}}
            {...(Platform.OS==='web'?({'aria-checked':enabled} as any):{})}
            style={[styles.toggleRow, enabled && styles.toggleRowActive]}
            onPress={() => setEnabled((current) => !current)}
          >
            <View style={styles.toggleText}>
              <PremiumFitLabel fontSize={13} minFontSize={11} style={styles.toggleTitle}>Mostra il benvenuto</PremiumFitLabel>
              <Text style={styles.toggleHint}>
                Puoi disattivarlo e riattivarlo in qualsiasi momento.
              </Text>
            </View>
            <View style={[styles.toggle, enabled && styles.toggleActive]}>
              <View style={[styles.toggleKnob, enabled && styles.toggleKnobActive]} />
            </View>
          </HapticTouchable>

          <Text style={styles.label}>Titolo</Text>
          <TextInput
            ref={titleRef}
            onFocus={() => { focusedRef.current = titleRef.current; revealFocusedField(); }}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            placeholder={DEFAULT_WELCOME_TITLE}
            placeholderTextColor="#8A95A6"
            style={styles.input}
          />

          <View style={styles.labelRow}>
            <Text style={styles.label}>Messaggio</Text>
            <Text style={styles.counter}>{message.length}/500</Text>
          </View>
          <TextInput
            ref={messageRef}
            onFocus={() => { focusedRef.current = messageRef.current; revealFocusedField(); }}
            value={message}
            onChangeText={setMessage}
            maxLength={500}
            multiline
            textAlignVertical="top"
            placeholder={DEFAULT_WELCOME_MESSAGE}
            placeholderTextColor="#8A95A6"
            style={[styles.input, styles.messageInput]}
          />

          <Text style={styles.placeholderHint}>
            Puoi usare {'{nome}'} per il nome del cliente e {'{salone}'} per il nome
            dell’attività.
          </Text>

          <Text style={[styles.label,{marginTop:6}]}>Anteprima</Text>
          <View style={{flexDirection:'row',gap:12,alignItems:'flex-start',padding:14,borderRadius:18,borderWidth:1,borderColor:pal.border,backgroundColor:pal.night?'rgba(38,41,43,.95)':'#FFFDF9',shadowColor:'#000',shadowOpacity:pal.night?.35:.08,shadowRadius:12,shadowOffset:{width:0,height:5}}}>
            <NativeMedal icon="storefront-outline" size={40} iconSize={18} accent={pal.night?'#8FBF9A':'#3F7A4D'} />
            <View style={{flex:1,minWidth:0,gap:4}}>
              <Text style={{fontSize:15,lineHeight:20,fontWeight:'600',color:pal.ink}}>
                {(normalizedTitle || DEFAULT_WELCOME_TITLE)
                  .replace(/\{nome\}/gi, 'Giulia')
                  .replace(/\{salone\}/gi, workspace.salonName || 'il salone')}
              </Text>
              <Text style={{fontSize:13,lineHeight:19,color:pal.muted}}>
                {(normalizedMessage || DEFAULT_WELCOME_MESSAGE)
                  .replace(/\{nome\}/gi, 'Giulia')
                  .replace(/\{salone\}/gi, workspace.salonName || 'il salone')}
              </Text>
            </View>
          </View>

          <HapticTouchable
            style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
            onPress={save}
            disabled={!canSave}
          >
            <Text style={[styles.saveButtonText, !canSave && {color:pal.muted}]}>
              {saving ? 'Salvataggio…' : canSave ? 'Salva benvenuto' : 'Nessuna modifica'}
            </Text>
          </HapticTouchable>
        </View>
  );

  return (
    <>
    {Platform.OS !== 'web' ? <Appearance.Provider value={outerAppearance}><NativeCustomerUtilityCard
      icon="storefront-outline"
      title="Benvenuto nuovi clienti"
      description="Compare una sola volta, dopo notifiche e Face ID o impronta."
      action="Personalizza"
      accessibilityLabel="Personalizza messaggio di benvenuto clienti"
      status={{label:enabled?'Attivo':'Disattivo',active:enabled}}
      onPress={toggleExpanded}
    /></Appearance.Provider> : (
    <View
      {...(Platform.OS==='web'?{dataSet:{customerWelcomeCard:'true'}}:{})}
      style={[
        styles.card,
        expanded && Platform.OS === 'web' ? styles.cardExpanded : styles.cardCompact,
        wideWebLayout && styles.cardWideWeb,
      ]}
    >
      <View {...(Platform.OS==='web'?{dataSet:{customerWelcomeHeader:'true'}}:{})} style={[styles.header, wideWebLayout && styles.headerWideWeb]}>
        <View style={[styles.iconRail, wideWebLayout && styles.sideRailWideWeb]}>
          <NativeMedal icon="storefront-outline" size={44} iconSize={20} accent={outerAppearance.palette.night ? '#8FBF9A' : '#3F7A4D'} />
        </View>
        <View
          style={[
            styles.headerText,
            expanded && Platform.OS === 'web' && styles.headerTextExpanded,
            wideWebLayout && styles.headerTextWideWeb,
          ]}
        >
          <Text
            numberOfLines={Platform.OS==='web'?undefined:wideWebLayout?1:undefined}
            adjustsFontSizeToFit={wideWebLayout}
            minimumFontScale={0.86}
            style={[styles.title, wideWebLayout && styles.centerTextWideWeb]}
          >
            Benvenuto nuovi clienti
          </Text>
          <Text
            numberOfLines={Platform.OS==='web'?undefined:wideWebLayout?1:undefined}
            adjustsFontSizeToFit={wideWebLayout}
            minimumFontScale={0.82}
            style={[styles.description, wideWebLayout && styles.centerTextWideWeb]}
          >
            Compare una sola volta, dopo notifiche e Face ID o impronta.
          </Text>
        </View>
        <View
          {...(Platform.OS==='web'?{dataSet:{customerWelcomeActions:'true'}}:{})}
          style={[styles.headerMeta, wideWebLayout && styles.headerMetaWideWeb]}
        >
          <View {...(Platform.OS==='web'?{dataSet:{customerWelcomeStatus:'true'}}:{})} style={[styles.status, enabled ? styles.statusActive : styles.statusInactive]}>
            <Text
              style={[
                styles.statusText,
                enabled ? styles.statusTextActive : styles.statusTextInactive,
              ]}
            >
              {enabled ? 'Attivo' : 'Disattivo'}
            </Text>
          </View>
    {Platform.OS==='web'?<HapticTouchable webHoverLift accessibilityRole="button" accessibilityLabel="Personalizza messaggio di benvenuto clienti" onPress={toggleExpanded} style={{minHeight:40,paddingHorizontal:12,borderRadius:13,borderWidth:1,borderColor:premiumColor('#DAE3E9','borderColor'),backgroundColor:premiumColor('#FFF','backgroundColor'),flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7}}><Text style={{fontSize:13,fontWeight:'500',color:premiumColor('#334155')}}>Personalizza</Text><Ionicons name="arrow-forward" size={16} color={premiumColor('#334155')}/></HapticTouchable>:(
    <PremiumExpandButton
      salon
            compact
            expanded={expanded}
            editIcon
            onPress={toggleExpanded}
            accessibilityLabel={
              expanded
                ? 'Chiudi messaggio di benvenuto clienti'
                : 'Personalizza messaggio di benvenuto clienti'
            }
          />
    )}
        </View>
      </View>

      
    </View>    )}

    {(
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={expanded} transparent animationType="none" onRequestClose={closeEditor}>
        <CreationSheet premiumWeb premiumKind="customer" fillAvailableHeight={false} animatePresentation title="Benvenuto nuovi clienti" icon="storefront-outline" iconAccent={pal.night?"#8FBF9A":"#3F7A4D"}
          onClose={closeEditor} scrollRef={scrollRef} onRevealFocusedField={revealFocusedField}>
          {editor}
        </CreationSheet>
      </Modal>
    )}
    </>
  );
}

const baseCustomerComponentStyles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 24,
    backgroundColor: '#F0FDF8',
    borderWidth: 1,
    borderColor: '#BCE8D6',
    overflow: 'hidden',
  },
  cardCompact: {
    alignSelf: 'center',
    maxWidth: '100%',
  },
  cardExpanded: {
    alignSelf: 'stretch',
    width: '100%',
  },
  cardWideWeb: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: '100%',
  },
  header: {
    paddingHorizontal: 15,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerWideWeb: {
    minHeight: 72,
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 18,
    paddingVertical: 14,
    position: 'relative',
  },
  iconRail: {
    flexShrink: 0,
  },
  sideRailWideWeb: {
    position: 'absolute',
    left: 18,
    top: 0,
    bottom: 0,
    width: 100,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D7F5E8',
  },
  headerText: { flexGrow: 0, flexShrink: 1, minWidth: 0 },
  headerTextExpanded: { flexGrow: 1 },
  headerTextWideWeb: {
    position: 'absolute',
    left: 130,
    right: 130,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  centerTextWideWeb: {
    width: '100%',
    textAlign: 'center',
  },
  title: { color: '#123B31', fontSize: 15, fontWeight: '900', textAlign: 'left' },
  description: {
    marginTop: 3,
    color: '#58756D',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'left',
  },
  headerMeta: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 7,
  },
  headerMetaWideWeb: {
    position: 'absolute',
    right: 18,
    top: 0,
    bottom: 0,
    width: 100,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    zIndex: 2,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderWidth: 1,
    borderColor: '#CDE9DD',
  },
  status: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusActive: { backgroundColor: '#D5F5E4' },
  statusInactive: { backgroundColor: '#E9EDF2' },
  statusText: { fontSize: 10, fontWeight: '900' },
  statusTextActive: { color: '#166044' },
  statusTextInactive: { color: '#687385' },
  editor: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#CDE9DD',
  },
  modalEditor: { paddingHorizontal: 0, paddingBottom: 0, borderTopWidth: 0 },
  toggleRow: {
    marginTop: 15,
    padding: 13,
    borderRadius: 15,
    backgroundColor: '#F7FAF9',
    borderWidth: 1,
    borderColor: '#DCE6E2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  toggleRowActive: { backgroundColor: '#E8FAF2', borderColor: '#A8DFC9' },
  toggleText: { flex: 1 },
  toggleTitle: { color: '#20352F', fontSize: 13, fontWeight: '800' },
  toggleHint: { marginTop: 2, color: '#6D7E78', fontSize: 11, lineHeight: 15 },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: '#B8C0CB',
  },
  toggleActive: { backgroundColor: '#2B9A72' },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobActive: { alignSelf: 'flex-end' },
  labelRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: { marginTop: 3, color: '#2D443C', fontSize: 12, fontWeight: '800' },
  counter: { color: '#71817B', fontSize: 11 },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#CFDDD8',
    borderRadius: 13,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    color: '#172720',
    fontSize: 14,
  },
  messageInput: { minHeight: 105 },
  placeholderHint: {
    color: '#688078',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  preview: {
    marginTop: 3,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D4E8DF',
  },
  previewEyebrow: {
    color: '#288060',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },
  previewTitle: {
    marginTop: 5,
    color: '#17382E',
    fontSize: 16,
    fontWeight: '900',
  },
  previewMessage: {
    marginTop: 5,
    color: '#587168',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  saveButton: {
    marginTop: 4,
    minHeight: 47,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#167554',
  },
  saveButtonDisabled: { opacity: 0.42 },
  saveButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
});

