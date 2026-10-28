import { OwnerSidebarViewportHost } from './owner-sidebar-viewport-host';
import { premiumWebCardStyles } from './premium-web-surfaces';
import { OwnerBrandMark } from './salon-brand-mark';
import React from 'react';
import { useAppContext } from '../src/context/AppContext';
import { ShopEntry } from './shop/shop-entry';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { SALON_MODULES, type SalonModuleKey } from '../src/lib/salon-modules';

export const OWNER_RAIL_WIDTH = 224;

/** Keeps the appearance preference available when the desktop rail is hidden. */
export function OwnerPremiumCompactAppearance({ inline = false }: { inline?: boolean }) {
  const { palette: p, toggle } = useAccessAppearance();
  if(!inline)return null;
  return (
    <View {...{dataSet:{ownerCompactHeader:'true'}}} style={{position:inline?'relative':'absolute',top:inline?0:20,right:inline?0:24,zIndex:10,alignItems:'flex-end'}}> 
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={p.night ? 'Attiva tema chiaro' : 'Attiva tema scuro'}
        onPress={toggle}
        style={({ pressed }) => ({ flexDirection: 'row', gap: 7, minHeight: 40, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: p.border, borderRadius: 12, backgroundColor: p.surface, opacity: pressed ? 0.75 : 1 })}
      >
        <Ionicons name={p.night ? 'sunny-outline' : 'moon-outline'} size={16} color={p.ink}/>
        <Text style={{ fontSize: 12, color: p.ink }}>{p.night ? 'Chiaro' : 'Scuro'}</Text>
      </Pressable>
    </View>
  );
}

type Item = { key: SalonModuleKey; label: string; selected: boolean; badge: number; onPress: () => void };
const groups: { title: string; keys: (SalonModuleKey | 'shop')[] }[] = [
  { title: 'OPERATIVITÀ', keys: ['index', 'agenda', 'prenotazioni'] },
  { title: 'PERSONE', keys: ['clienti'] },
  { title: 'GESTIONE', keys: ['servizi', 'cassa', 'shop', 'settings'] },
];

/** Desktop presentation only. Route transitions remain owned by the existing tab navigator. */
export function OwnerPremiumSidebar({ items }: { items: Item[] }) {
  const { palette: p, mode, setMode } = useAccessAppearance();
  const { salonWorkspace } = useAppContext();
  const selectedFill=p.night?'rgba(216,194,155,.22)':'rgba(52,55,53,.82)';
  const selectedInk=p.night?'#E9D9BB':'#FFFFFF';
  const selectedBorder=p.night?'rgba(216,194,155,.36)':'rgba(52,55,53,.28)';
  const auxiliary = (label: string, icon: React.ComponentProps<typeof Ionicons>['name'], onPress: () => void, attention = false) => <Pressable accessibilityRole="button" accessibilityLabel={`Apri ${label}`} onPress={onPress} style={({ hovered }: any) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderRadius: 13, backgroundColor: hovered ? p.field : 'transparent' })}><Ionicons name={icon} size={19} color={p.muted} /><Text style={{ flex: 1, color: p.ink, fontSize: 12 }}>{label}</Text>{attention ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#D83F4C' }} /> : null}</Pressable>;
  return <OwnerSidebarViewportHost><View style={{ position: 'fixed', zIndex: 30, left: 0, top: 0, bottom: 0, height: '100dvh', maxHeight: '100dvh', boxSizing: 'border-box', flexShrink: 0, width: OWNER_RAIL_WIDTH, padding: 16, backgroundColor: p.night ? 'rgba(27,30,31,.36)' : 'rgba(255,253,249,.24)', borderRightWidth: 1, borderRightColor: p.border, backdropFilter: 'blur(16px)', overflow:'hidden', isolation:'isolate', clipPath:'inset(0)', contain:'paint', boxShadow:'none' } as any}>
    <View pointerEvents="none" style={{position:'absolute',inset:0,backgroundImage:p.night?'linear-gradient(140deg,rgba(255,255,255,.035),transparent 60%)':'linear-gradient(140deg,rgba(255,255,255,.22),transparent 60%)',borderRadius:22} as any}/>
    <View style={{ height: 112, justifyContent: 'center' }}><OwnerBrandMark /></View>
    <View style={{ height: 1, backgroundColor: p.line, marginBottom: 22 }} />
    <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
      {groups.map(group => <View key={group.title} style={{ marginBottom: 22 }}>
        <Text style={{ color: p.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.8, marginLeft: 13, marginBottom: 9 }}>{group.title}</Text>
        {group.keys.map(key => { if (key === 'shop') return <ShopEntry key="shop" workspaceId={salonWorkspace.id} renderTrigger={(open, attention) => auxiliary('Shop e magazzino', 'bag-handle-outline', open, attention)} />; const item = items.find(candidate => candidate.key === key); if (!item) return null;
          return <Pressable key={key} accessibilityRole="tab" aria-selected={item.selected} accessibilityState={{ selected: item.selected }} accessibilityLabel={item.label} onPress={item.onPress}
            style={({ pressed, hovered }: any) => ({ minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, marginBottom: 5, borderRadius: 15, borderWidth: 1, borderColor: item.selected ? selectedBorder : 'transparent', backgroundColor: item.selected ? selectedFill : hovered ? p.field : 'transparent', opacity: pressed ? .75 : 1, overflow: 'hidden', boxShadow: item.selected ? '0 4px 12px rgba(25,25,25,.1), inset 0 1px 0 rgba(255,255,255,.2)' : 'none' } as any)}>
            {item.selected ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, backgroundColor: p.night ? '#D7C299' : '#D7C299' }} /> : null}
            <Ionicons name={SALON_MODULES[key].icon.inactive} size={19} color={item.selected ? selectedInk : p.muted} />
            <Text style={{ flex: 1, color: item.selected ? selectedInk : p.ink, fontSize: item.selected ? 15 : 13, fontWeight: item.selected ? '600' : '500' }}>{item.label}</Text>
            {item.badge > 0 ? <Text style={{ color: item.key === 'agenda' || item.key === 'prenotazioni' ? '#FFFFFF' : item.selected ? p.actionText : p.ink, backgroundColor: item.key === 'agenda' || item.key === 'prenotazioni' ? '#D63745' : p.field, fontSize: 10, fontWeight: '700', minWidth: 22, padding: 4, borderRadius: 8, textAlign: 'center' }}>{item.badge}</Text> : null}
          </Pressable>;
        })}
      </View>)}
    </ScrollView>
    <View style={{ borderTopWidth: 1, borderTopColor: p.line, paddingTop: 16 }}><Text style={{ color: p.muted, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>ASPETTO</Text><View style={{ flexDirection: 'row', gap: 4, marginBottom: 12 }}>{([['day', 'Chiaro'], ['night', 'Scuro'], ['system', 'Auto']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === 'system' ? 'Aspetto automatico' : `Aspetto ${label.toLowerCase()}`} accessibilityState={{ selected: mode === value }} aria-pressed={mode === value} onPress={() => setMode(value)} style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: mode === value ? selectedBorder : 'transparent', backgroundColor: mode === value ? selectedFill : 'transparent' }}><Text style={{ color: mode === value ? selectedInk : p.ink, fontSize: 11, fontWeight: mode === value ? '600' : '400' }}>{label}</Text></Pressable>)}</View><Text style={{ color: p.muted, fontSize: 10, textAlign: 'right', letterSpacing: 1 }}>IL TUO SALONE, CON CURA.</Text></View>
  </View></OwnerSidebarViewportHost>;
}

export function OwnerPremiumHomeHeading({ salonName, onLongPress }: { salonName: string; onLongPress: () => void }) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  return <Pressable onLongPress={onLongPress} style={{ paddingTop: width<1000?24:6, paddingBottom: 6 }}>
    {width<1000?<View style={{marginBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14}}><OwnerBrandMark compact/><OwnerPremiumCompactAppearance inline/></View>:<Text style={{ color: p.muted, fontSize: 11, letterSpacing: 2, fontWeight: '600', marginBottom: 6 }}>{salonName}</Text>}
    <Text accessibilityRole="header" style={{ color: p.ink, fontFamily: 'Georgia', fontSize: width < 600 ? 30 : 48, letterSpacing: -1 }}>Il tuo salone, oggi.</Text>
    <Text style={{ color: p.muted, fontSize: width < 600 ? 14 : 17, marginTop: 7 }}>La tua giornata, in un colpo d’occhio.</Text>
  </Pressable>;
}

export function premiumHomeStyles<T extends Record<string, any>>(base: T, p: ReturnType<typeof useAccessAppearance>['palette'], width: number): T {
  if (Platform.OS !== 'web') return base;
  const result: Record<string, any> = {};
  // Keep semantic accents, dimensions controlling interaction, and every handler intact.
  for (const [key, value] of Object.entries(base)) {
    const s = { ...value };
    if (typeof s.fontSize === 'number') s.fontSize = Math.min(s.fontSize, s.fontSize >= 25 ? 28 : s.fontSize);
    if (s.color && ['#0F172A', '#0f172a', '#111827', '#1E293B', '#334155'].includes(s.color)) s.color = p.ink;
    if (s.color && ['#64748b', '#64748B', '#475569', '#6B7280'].includes(s.color)) s.color = p.muted;
    if (['#FFFFFF', '#ffffff', '#FFF', '#fff'].includes(s.backgroundColor)) { s.backgroundColor = p.surface; s.borderWidth = 1; s.borderColor = p.border; }
    if (p.night) {
      const rgb = (color: unknown) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : null;
      if (typeof s.backgroundColor === 'string' && /^rgba?\(255,\s*255,\s*255/.test(s.backgroundColor)) { s.backgroundColor = p.surface; s.borderColor = p.border; }
      const bg = rgb(s.backgroundColor);
      if (bg && Math.min(...bg) > 170) { s.backgroundColor = p.field; s.borderColor = p.border; }
      const ink = rgb(s.color);
      if (ink && Math.max(...ink) < 210) s.color = p.muted;
    }
    if (s.shadowRadius) { s.shadowOpacity = .07; s.shadowRadius = 16; s.shadowOffset = { width: 0, height: 6 }; }
    result[key] = s;
  }
  const patch = (key: string, value: any) => { result[key] = { ...result[key], ...value }; };
  for (const key of Object.keys(result)) {
    if (!/^(operatorModal|customerInsight)/.test(key) || /Status|Phase|Error/.test(key)) continue;
    const v=result[key];
    if(v.backgroundColor) v.backgroundColor=p.field;
    if(v.borderColor) v.borderColor=p.border;
    if(v.color) v.color=/Text|Role|Label|Subtitle|Eyebrow/.test(key)?p.muted:p.ink;
    v.shadowOpacity=0; v.boxShadow='none';
  }
  patch('operatorModalBackdrop',{backgroundColor:p.night?'rgba(0,0,0,.5)':'rgba(40,35,29,.28)',backdropFilter:'blur(8px)'});
  for(const key of ['operatorModalCard','customerInsightModalCard']) patch(key,{maxWidth:1120,maxHeight:'94%',padding:24,backgroundColor:p.night?'rgba(27,30,31,.88)':'rgba(248,245,240,.88)',backdropFilter:'blur(26px)',boxShadow:'inset 0 1px 0 #ffffff55,0 16px 70px #00000022',borderColor:p.border,borderRadius:26});
  patch('operatorModalTitle',{fontFamily:'Georgia',fontSize:27,lineHeight:34,fontWeight:'400',color:p.ink});
  patch('operatorModalCloseButton',{width:90,minHeight:40,flexDirection:'row',gap:8,paddingHorizontal:12,borderRadius:11,backgroundColor:p.field,borderWidth:1,borderColor:p.border});
  patch('operatorModalScopeChipActive',{backgroundColor:p.action,borderColor:p.action});
  patch('operatorModalScopeChipTextActive',{color:p.actionText});
  patch('customerInsightPickerChipActive',{backgroundColor:p.action,borderColor:p.action});
  patch('customerInsightPickerChipTitleActive',{color:p.actionText});
  patch('customerInsightPickerChipMetaActive',{color:p.actionText});
  patch('operatorModalBoard',{padding:18,borderRadius:15,backgroundColor:p.field});
  patch('operatorModalBoardEmpty',{padding:14,borderRadius:12,backgroundColor:'transparent',borderColor:p.border});
  patch('operatorModalBoardAvatar',{backgroundColor:p.night?'rgba(222,211,186,.14)':'#eee6d8',borderWidth:1,borderColor:p.border,borderRadius:13});
  patch('operatorModalBoardName',{fontSize:20,lineHeight:26,color:p.ink});
  patch('operatorModalBoardRole',{fontSize:12,fontWeight:'400',color:p.muted});
  patch('operatorModalBoardEmpty',{padding:12,borderWidth:0,borderTopWidth:1,borderColor:p.line,borderRadius:0,backgroundColor:'transparent'});
  patch('operatorModalCounterPill',{backgroundColor:p.night?'rgba(143,182,153,.13)':'rgba(225,239,225,.46)',borderRadius:11,minWidth:72});
  patch('operatorModalCounterPillSoft',{backgroundColor:p.night?'rgba(154,145,192,.13)':'#e8e4f1',borderRadius:11,minWidth:72});
  patch('customerInsightBoard',{backgroundColor:'transparent',padding:0,borderWidth:0});
  patch('customerInsightBoardName',{fontFamily:'Georgia',fontSize:27,lineHeight:34,fontWeight:'400',color:p.ink});
  patch('customerInsightSpendBadge',{backgroundColor:p.night?'rgba(143,182,153,.13)':'rgba(225,239,225,.46)',paddingHorizontal:20,paddingVertical:12});
  patch('customerInsightStatValue',{fontSize:27,lineHeight:34,color:p.ink});
  patch('customerInsightStatLabel',{fontSize:12,fontWeight:'400',color:p.muted});
  patch('customerInsightHighlightCard',{backgroundColor:p.night?'rgba(186,164,123,.1)':'rgba(247,230,205,.40)',borderColor:p.border,padding:16});
  patch('customerInsightServicesCard',{backgroundColor:p.night?'rgba(151,145,177,.08)':'rgba(231,225,243,.40)',borderColor:p.border,padding:18});
  patch('customerInsightTimelineCard',{backgroundColor:p.night?'rgba(128,154,171,.08)':'rgba(223,234,241,.40)',borderColor:p.border,padding:18});
  patch('customerInsightSectionTitle',{fontSize:21,lineHeight:28,fontFamily:'Georgia',fontWeight:'400',color:p.ink,marginBottom:12});
  patch('customerInsightFilterChipActive',{backgroundColor:p.action,borderColor:p.action});
  patch('customerInsightFilterChipTextActive',{color:p.actionText});
  patch('customerInsightFilterChipCountActive',{color:p.actionText,backgroundColor:'transparent'});
  patch('container', { backgroundColor: 'transparent' });
  patch('content', { paddingBottom: width >= 1000 ? 24 : 80 });
  patch('heroCard', { backgroundColor: p.surface, padding: 20, paddingTop: 0, borderRadius: 24, borderWidth: 1, borderColor: p.border, boxShadow: 'inset 0 1px 0 #ffffff88, 0 12px 36px #29231a0a', backdropFilter: 'blur(22px)' });
  patch('dashboardSectionHeading', { textAlign: 'left', fontSize: 13, letterSpacing: .3, marginTop: 16, marginBottom: 10, color: p.ink });
  for (const key of ['heroMetaCard', 'heroMetricCardBlue', 'heroMetricCardRose']) patch(key, { paddingVertical: 12, borderRadius: 18, borderWidth: 1, borderColor: p.border, shadowOpacity: .03 });
  patch('heroTopRow', { gap: 10, marginBottom: 10 });
  patch('heroMetricsRow', { gap: 10 });
  for (const key of ['sectionCard']) patch(key, { backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 22, padding: 18, marginBottom: 12, backdropFilter: 'blur(22px)', boxShadow: 'inset 0 1px 0 #ffffff66, 0 8px 28px #29231a08' });
  for (const key of ['insightCard', 'insightCardMint']) patch(key, { minWidth: '22%', borderRadius: 16, paddingVertical: 14 });
  for (const key of ['halfWidthCard', 'desktopThirdCard']) patch(key, { width: width < 600 ? '48%' : '23%', minWidth: width < 600 ? '45%' : 150, flexBasis: width < 600 ? '48%' : '23%' });
  patch('insightCardCompact', { minHeight: 74 });
  patch('operatorAgendaStatPill', { height: 86 });
  patch('operatorAgendaStatValueWebWide', { fontSize: 24, lineHeight: 28 });
  patch('operatorAgendaStatLabelWebWide', { fontSize: 12, lineHeight: 16 });
  patch('pageShell', { maxWidth: '100%', width: '100%' });
  patch('sectionTitleCentered', { textAlign: 'left', alignSelf: 'stretch', fontSize: 16 });
  patch('sectionTextCentered', { textAlign: 'left' });
  patch('priorityTitle', { fontSize: 15, lineHeight: 21 });
  patch('priorityText', { fontSize: 11, lineHeight: 17 });
  patch('operatorAgendaCardHeader', { justifyContent: 'space-between', minHeight: 42, marginBottom: 6, height: 'auto' });
  patch('operatorAgendaCardTextWrap', { paddingHorizontal: 0, paddingRight: 0, alignItems: 'flex-start', width: undefined });
  patch('operatorAgendaCardAction', { backgroundColor: p.action, borderColor: p.border, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2)', borderRadius: 13 });
  patch('operatorAgendaCardActionText', { color: p.actionText });
  patch('operatorAgendaCardTitle', { fontSize: 17, fontFamily: 'Georgia', textAlign: 'left', marginBottom: 0 });
  patch('operatorAgendaStatPill', { height: 68, borderRadius: 15, paddingVertical: 8 });
  patch('operatorAgendaPreviewRow', { paddingVertical: 9, borderRadius: 14 });
  patch('smartItemCentered', { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, gap: 12 });
  patch('smartTextCentered', { textAlign: 'left' });
  patch('smartLabel', { fontSize: 12 });
  patch('smartValue', { fontSize: 14, flexShrink: 1, minWidth: 0, paddingRight: 4 });
  patch('profilePreviewCard', { padding: 12, marginTop: 12, borderRadius: 16, backgroundColor: p.field });
  patch('profilePreviewInfoRow', { gap: 5 });
  patch('profileProgressRow', { flexWrap: 'wrap', gap: 4, marginVertical: 0 });
  patch('profilePreviewMeta', { fontSize: 11, textAlign: 'left' });
  patch('profilePreviewInfoText', { fontSize: 11 });
  patch('accessCard', { padding: 14, borderRadius: 16, backgroundColor: p.field, borderColor: p.border, alignItems: 'stretch' });
  patch('accessCode', { fontSize: 21, textAlign: 'left', marginBottom: 8 });
  patch('accessLabel', { textAlign: 'left', fontSize: 10 });
  patch('accessLink', { fontSize: 11, lineHeight: 17, color: p.muted });
  patch('accessLinkPlate', { padding: 8, borderRadius: 10, backgroundColor: p.field });
  patch('qrCard', { padding: 12, borderRadius: 16, backgroundColor: p.field, borderColor: p.border });
  patch('qrFrame', { padding: 5, borderRadius: 14, shadowOpacity: 0 });
  patch('qrPlate', { padding: 8, borderRadius: 10, backgroundColor: '#FFFFFF', shadowOpacity: 0 });
  patch('qrTitle', { fontSize: 15, marginBottom: 3 });
  patch('qrText', { fontSize: 11, lineHeight: 16 });
  patch('qrSalonBadge', { marginTop: 8, paddingTop: 8 });
  patch('manualCodeHint', { fontSize: 10, lineHeight: 14 });
  patch('clientAccessPrimaryButton', { minHeight: 42, borderRadius: 12, backgroundColor: p.action, borderColor: p.border, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.2)' });
  patch('clientAccessPrimaryButtonText', { color: p.actionText, fontSize: 12 });
  patch('clientAccessSecondaryButton', { minHeight: 42, borderRadius: 12, backgroundColor: p.field, borderColor: p.border });
  patch('clientAccessSecondaryButtonText', { color: p.ink, fontSize: 12 });
  for (const key of ['profileModuleEyebrow', 'profileModuleTitle', 'fieldLabel', 'profileProtectedCaption']) patch(key, { color: p.ink });
  for (const key of ['profileModuleCaption', 'profileEditorCaption', 'profileSectionCaption']) patch(key, { color: p.muted, fontWeight: '400' });
  patch('profileEditorCard', { backgroundColor: 'transparent', borderWidth: 0, boxShadow: 'none', padding: 0 });
  patch('profileModuleCard', { backgroundColor: 'transparent', borderWidth: 0, borderRadius: 0, boxShadow: 'none' });
  patch('profileSaveButton', { backgroundColor: p.action, borderColor: p.border, borderRadius: 13, minHeight: 48, boxShadow: 'none' });
  patch('previewButtonText', { color: p.actionText });
  patch('profileSaveButtonEyebrow', { color: p.actionText });
  patch('profileModuleBadgeComplete', { backgroundColor: p.field, borderColor: p.border });
  patch('profileModuleBadgeTextComplete', { color: p.muted });
  if (p.night) {
    patch('profileProgressItemCompleted', { backgroundColor: 'rgba(146,181,150,.12)', borderColor: p.border });
    patch('statusHotText', { color: '#F1A69D' });
    patch('statusWarmText', { color: '#9FD0B3' });
    patch('statusCalmText', { color: '#ABC4E6' });
    patch('heroMetricLabelBlue', { color: '#C9B7EF' });
    patch('heroMetricLabelRose', { color: '#D8BD96' });
    patch('insightCard', { backgroundColor: 'rgba(200,172,130,.09)' });
    patch('insightCardMint', { backgroundColor: 'rgba(146,181,150,.09)' });
  }
  if (p.night) for (const key of ['heroMetaCardToday', 'heroMetricCardBlue', 'heroMetricCardRose']) patch(key, { backgroundColor: p.field });
  patch('operatorAgendaPreviewRowWeb',{flexWrap:'wrap',height:'auto'});
  patch('operatorAgendaPreviewLeftWeb',{flexBasis:160,flexGrow:1,minWidth:0});
  patch('operatorAgendaPreviewMetricsWeb',{marginLeft:'auto',flexShrink:0});
  for(const key of ['operatorAgendaPreviewNameWeb','operatorAgendaPreviewRoleWeb'])patch(key,{whiteSpace:'normal',overflow:'visible',textOverflow:'clip'});
  return premiumWebCardStyles(result,p) as T;
}

/** Scoping is deliberate: these structural rules never reach native or other tabs. */
export const webHomePart = (part: string) => Platform.OS === 'web' ? { dataSet: { premiumHome: part } } : {};
export function OwnerPremiumHomeRegion({ part, children }: { part: string; children: React.ReactNode }) {
  return Platform.OS === 'web' ? <View {...webHomePart(part)}>{children}</View> : <>{children}</>;
}
export function OwnerPremiumHomeCss() {
  const { palette: p } = useAccessAppearance();
  if (Platform.OS !== 'web') return null;
  return React.createElement('style', null, `
[data-premium-home="insight-scroll"] > div { display:grid!important; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px!important; }
[data-premium-home="operator-detail"] { border:1px solid ${p.border}!important; background:${p.night?'rgba(134,158,151,.09)':'rgba(224,234,227,.35)'}!important; box-shadow:inset 0 1px 0 #ffffff24,0 4px 12px #00000006!important; }
[data-premium-home="operator-detail"]:nth-child(2n) { background:${p.night?'rgba(158,145,176,.09)':'rgba(234,228,240,.35)'}!important; }
[data-premium-home="customer-stats"] > div, [data-premium-home="operator-detail"], [data-premium-home="customer-services"], [data-premium-home="customer-timeline"] { backdrop-filter:blur(22px); border:1px solid ${p.border}!important; box-shadow:inset 0 1px 0 ${p.night?'#ffffff20':'#ffffff99'},0 5px 16px #49362307!important; background-image:radial-gradient(ellipse at 10% 0%,${p.night?'#ffffff06':'#ffffff66'},transparent 70%); }
[data-premium-home="customer-stats"] { display:grid!important; grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr)); gap:10px!important; }
[data-premium-home="customer-stats"] > div { width:auto!important; min-width:0!important; padding:16px!important; border-color:${p.border}!important; background:${p.night?'rgba(143,167,180,.1)':'rgba(222,234,246,.4)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(3n+2) { background:${p.night?'rgba(168,148,180,.1)':'rgba(234,225,245,.4)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(3n+3) { background:${p.night?'rgba(143,174,150,.1)':'rgba(222,238,224,.4)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(1) { background:${p.night?'rgba(143,168,192,.09)':'rgba(225,235,246,.32)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(2) { background:${p.night?'rgba(167,146,191,.09)':'rgba(237,228,246,.32)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(3) { background:${p.night?'rgba(143,174,151,.09)':'rgba(228,240,227,.32)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(4) { background:${p.night?'rgba(192,157,128,.09)':'rgba(249,235,219,.32)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(5) { background:${p.night?'rgba(187,142,157,.09)':'rgba(246,227,234,.32)'}!important; }
[data-premium-home="customer-stats"] > div:nth-child(6) { background:${p.night?'rgba(130,171,169,.09)':'rgba(223,240,236,.32)'}!important; }
[data-premium-home="customer-detail"] > div:nth-child(3) > div:first-child { background:${p.night?'rgba(188,167,123,.08)':'rgba(247,232,203,.30)'}!important; }
[data-premium-home="customer-detail"] > div:nth-child(3) > div:last-child { background:${p.night?'rgba(145,161,183,.08)':'rgba(224,234,245,.30)'}!important; }
@media(max-width:600px){[data-premium-home="operator-detail"] > div:first-child {flex-direction:column!important;align-items:stretch!important;gap:12px!important;} [data-premium-home="operator-detail"] > div:first-child > div:first-child {width:100%!important;min-width:0!important;} [data-premium-home="operator-detail"] > div:first-child > div:last-child {align-self:flex-end;} [data-premium-home="customer-detail"] > div:first-child {flex-wrap:wrap!important;gap:12px!important;} [data-premium-home="customer-detail"] > div:first-child > div:first-child {flex-basis:100%!important;} }
[data-premium-home="operator-detail"]:nth-child(3) { background:${p.night?'rgba(186,155,125,.08)':'rgba(249,231,213,.30)'}!important; }
[data-premium-home="operator-detail"]:nth-child(4) { background:${p.night?'rgba(129,156,181,.08)':'rgba(222,234,246,.30)'}!important; }
@media(min-width:900px){[data-premium-home="customer-detail"] { display:grid!important; grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr); gap:18px!important; } [data-premium-home="customer-detail"] > div {grid-column:1/-1;} [data-premium-home="customer-detail"] > [data-premium-home="customer-services"] {grid-column:1;align-self:start;} [data-premium-home="customer-detail"] > [data-premium-home="customer-timeline"] {grid-column:2;align-self:start;}}
@media(max-width:700px){[data-premium-home="insight-scroll"] > div {grid-template-columns:minmax(0,1fr);}}
[data-premium-home="page"] { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:16px; align-items:start; }
[data-premium-home="page"] > * { min-width:0; margin:0!important; }
[data-premium-home="heading"], [data-premium-home="hero"], [data-premium-home="invite"] { grid-column:1 / -1; }
[data-premium-home="profile-open"] { grid-column:1/-1; }
[data-premium-home="heading"] { padding:10px 2px 2px; }
[data-premium-home="hero"] { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; padding:18px!important; }
[data-premium-home="hero"] > [role="heading"], [data-premium-home="totals"] { grid-column:1 / -1; margin:0!important; }
[data-premium-home="today"], [data-premium-home="metrics"] { display:contents; }
[data-premium-home="today"] > *, [data-premium-home="metrics"] > * { min-width:0; min-height:82px; padding:12px 8px!important; }
[data-premium-home="priority"], [data-premium-home="summary"] { grid-column:span 2; min-width:0; margin:0!important; }
[data-premium-home="priority"] { padding:16px!important; justify-content:center; }
[data-premium-home="summary"] { justify-content:center; gap:8px; }
[data-premium-home="summary"] > [role="heading"] { margin:0!important; font-size:11px!important; }
[data-premium-home="summary"] > div { margin:0!important; gap:6px; flex-wrap:nowrap; }
[data-premium-home="summary"] > div > div { padding:10px 4px!important; border-radius:14px; min-width:0; flex:1; }
[data-premium-home="operators"], [data-premium-home="customers"], [data-premium-home="smart"], [data-premium-home="profile"] { align-self:stretch; }
[data-premium-home="shop"] { align-self:stretch; }
[data-premium-home="shop"] > * { margin:0!important; height:100%; background-color:${p.surface}!important; border-color:${p.border}!important; backdrop-filter:blur(22px); }
[data-owner-home="shop"] [data-premium-shop-icon="true"] { background:${p.night?'rgba(190,176,149,.12)':'rgba(232,222,205,.5)'}!important; border:1px solid ${p.border}!important; border-radius:14px!important; }
[data-owner-home="shop"] [data-premium-shop-icon="true"] [dir="auto"] { color:${p.ink}!important; }
[data-premium-home="shop"] [dir="auto"]:not([style*="font-family: ionicons" i]) { color:${p.ink}!important; }
[data-premium-home="invite"] { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:12px; }
[data-premium-home="invite"] > [role="heading"], [data-premium-home="invite"] > [data-premium-home="access-warning"] { grid-column:1/-1; }
[data-premium-home="invite"] > [data-premium-home="link"] { grid-column:1; grid-row:2; min-width:0; margin:0!important; }
[data-premium-home="invite"] > [data-premium-home="qr"] { grid-column:2; grid-row:2 / span 2; margin:0!important; max-width:none; }
[data-premium-home="invite"] > [data-premium-home="print"] { grid-column:1; margin:0!important; align-self:end; }
[data-premium-home="profile-preview"] { display:grid; grid-template-columns:100px minmax(0,1fr); align-items:center; gap:8px 12px; }
[data-premium-home="profile-preview"] > * { min-width:0; }
[data-premium-home="profile-preview"] > :first-child { grid-column:1/-1; margin:0; }
[data-premium-home="plaque"] { width:100px; grid-column:1; grid-row:2 / span 3; }
[data-premium-home="plaque"] > * { max-width:100%; }
[data-premium-home="profile-preview"] > :nth-child(n+3) { grid-column:2; margin:0; }
[data-premium-home="qr"] { display:grid; grid-template-columns:124px minmax(0,1fr); gap:6px 12px; align-content:center; align-self:stretch!important; max-width:none!important; padding:14px!important; }
[data-premium-home="qr-title"] { grid-column:2; grid-row:1; text-align:left; margin:0!important; }
[data-premium-home="qr-subtitle"] { grid-column:2; grid-row:2; text-align:left; margin:0!important; }
[data-premium-home="qr-frame"] { grid-column:1; grid-row:1 / span 3; justify-self:center; }
[data-premium-home="qr-badge"] { grid-column:2; grid-row:3; margin:0!important; padding:4px 0!important; border:0; }
[data-premium-home="qr"] svg { width:108px; height:108px; }
[data-premium-home="link"] { align-self:stretch!important; justify-content:center; }
[data-premium-home="smart"] { justify-content:center; }
[data-premium-home="focus"] { justify-content:center; background-image:linear-gradient(120deg,rgba(255,255,255,.08),transparent); border:1px solid rgba(255,255,255,.2); }
[data-premium-home="hero"], [data-premium-home="operators"], [data-premium-home="customers"], [data-premium-home="smart"], [data-premium-home="profile"], [data-premium-home="invite"] { background-image:radial-gradient(ellipse at 8% 0%,rgba(255,255,255,.12),transparent 65%); }

@media(min-width:1500px) { [data-premium-home="page"] { gap:20px; grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); } }
@media(max-width:999px) { [data-premium-home="hero"] { grid-template-columns:repeat(2,minmax(0,1fr)); } [data-premium-home="hero"] > [role="heading"], [data-premium-home="totals"] { grid-column:1/-1; } }
@media(max-width:720px) { [data-premium-home="page"], [data-premium-home="invite"] { grid-template-columns:minmax(0,1fr); } [data-premium-home="invite"] > * { grid-column:1!important; grid-row:auto!important; } [data-premium-home="priority"], [data-premium-home="summary"] { grid-column:1/-1; } }
`);
}
