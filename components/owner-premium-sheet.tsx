import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { popupGlass } from './premium-web-surfaces';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';

type Props = React.PropsWithChildren<{ title: string; icon: React.ComponentProps<typeof Ionicons>['name']; onClose: () => void; dismissDisabled?: boolean; footer?: React.ReactNode; scrollRef?: React.MutableRefObject<ScrollView | null>; kind?: 'profile' | 'invite' | 'shop' | 'requests' | 'customer'; }>;
/** Web-only presentation inside an existing modal; business callbacks stay with the caller. */
export function OwnerPremiumSheetFrame({ title, icon, onClose, dismissDisabled, children, footer, scrollRef, kind = 'profile' }: Props) {
  const { palette: p } = useAccessAppearance();
  const { height, width } = useWindowDimensions();
  const compactRequests=width<600;
  return <View {...{ onClick: (event: React.MouseEvent) => event.stopPropagation() }} style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: width<480?12:20, paddingVertical:16, backgroundColor: p.night ? 'rgba(0,0,0,.54)' : 'rgba(40,35,29,.28)', backdropFilter: 'blur(8px)' } as any}>
    <View {...{ dataSet: { premiumSheet: kind } }} style={{ width: '100%', maxWidth: kind === 'customer' ? 600 : kind === 'requests' ? 760 : 1120, maxHeight: Math.max(120, height - 32), flexShrink: 1, borderTopLeftRadius: 26, borderTopRightRadius: 26, borderBottomLeftRadius:26, borderBottomRightRadius:26, borderWidth: 1, borderColor: p.border, backgroundColor: p.night ? 'rgba(27,30,31,.97)' : 'rgba(248,245,240,.97)', boxShadow: '0 -12px 80px rgba(20,16,12,.18), inset 0 1px 0 rgba(255,255,255,.5)', overflow: 'hidden', ...popupGlass(p) } as any}>
      {React.createElement('style', null, `
[data-premium-sheet] { --sheet-ink:${p.ink}; --sheet-muted:${p.muted}; --sheet-line:${p.night ? '#ffffff1c' : '#BDB2A333'}; --sheet-field:${p.night ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.55)'}; }
[data-premium-sheet] :is([aria-label="Svuota campo"],[aria-label^="Rimuovi altro numero"]) { background:transparent!important; border:0!important; border-radius:0!important; box-shadow:none!important; width:28px!important; height:28px!important; }
[data-premium-sheet] :is([aria-label="Svuota campo"],[aria-label^="Rimuovi altro numero"]) [dir="auto"] { color:var(--sheet-muted)!important; }
[data-premium-sheet] :is([aria-label="Svuota campo"],[aria-label^="Rimuovi altro numero"]):hover { background:${p.night ? 'rgba(255,255,255,.12)' : 'rgba(60,50,35,.08)'}!important; }
[data-premium-sheet] [data-premium-home="add-phone"] { align-self:flex-start; min-height:40px; padding:9px 14px!important; border:1px solid var(--sheet-line)!important; border-radius:11px; background:var(--sheet-field)!important; margin-top:10px; }
[data-premium-sheet] [data-premium-home="add-phone"] [dir="auto"] { color:var(--sheet-ink)!important; font-size:13px!important; font-weight:500!important; }
[data-premium-sheet] [data-premium-home="logo-editor"] [aria-label="Modifica logo e targhetta"] { background:transparent!important; border-color:var(--sheet-line)!important; }
[data-premium-sheet="shop"] [role="switch"], [data-premium-sheet="shop"] [role="switch"] * { box-shadow:none!important; outline:none; }
[data-premium-sheet] input[role="switch"], [data-premium-sheet] input[type="checkbox"], [data-premium-sheet] input[type="radio"] { background:transparent!important; box-shadow:none!important; border:0!important; border-radius:0!important; min-height:0!important; }
[data-premium-sheet] :focus-visible { outline:2px solid ${p.night ? '#DDC496' : '#9D845A'}!important; outline-offset:3px; }
[data-premium-sheet] [data-premium-shop-nav] { background:var(--sheet-field)!important; border-color:var(--sheet-line)!important; border-radius:13px!important; }
[data-premium-sheet] [data-premium-shop-nav] [role="tab"] { background:transparent!important; border:0!important; border-radius:10px; }
[data-premium-sheet] [data-premium-shop-nav] [role="tab"] [dir="auto"] { color:var(--sheet-muted)!important; font-size:13px; }
[data-premium-sheet] [data-premium-shop-nav] [role="tab"][aria-selected="true"] { background:${p.action}!important; }
[data-premium-sheet] [data-premium-shop-nav] [role="tab"][aria-selected="true"] [dir="auto"] { color:${p.actionText}!important; }
[data-premium-sheet] [data-premium-home="logo-editor"] > div { background:transparent!important; border:0!important; box-shadow:none!important; }
[data-premium-sheet] [data-premium-home="logo-editor"] > div > div { background:transparent!important; border-color:var(--sheet-line)!important; }
[data-premium-sheet] [data-premium-home="activity-picker"] > div > [role="button"] { background:var(--sheet-field)!important; border-color:var(--sheet-line)!important; }
[data-premium-sheet] [data-premium-home="activity-picker"] [dir="auto"], [data-premium-sheet] [data-premium-home="logo-editor"] [dir="auto"] { color:var(--sheet-ink)!important; }
[data-premium-sheet] [aria-label="Modifica logo e targhetta"] > div:last-child { background:var(--sheet-field)!important; border:1px solid var(--sheet-line)!important; border-radius:11px!important; min-height:38px; padding:9px 12px!important; }
[data-premium-sheet] [aria-label="Modifica logo e targhetta"] > div:last-child [dir="auto"] { color:var(--sheet-ink)!important; }
[data-premium-sheet] [data-premium-home="logo-editor"] { margin-top:18px!important; background:var(--sheet-field)!important; border:1px solid var(--sheet-line)!important; border-radius:16px!important; padding:16px!important; overflow:hidden; }
[data-premium-sheet] [data-premium-home="logo-editor"] > div > div:first-child { margin:0!important; padding:0 0 14px!important; }
[data-premium-sheet] [data-premium-home="logo-editor"] img { max-width:100%; }
[data-premium-sheet] [data-premium-home="logo-editor"] > div { padding:0!important; }
[data-premium-sheet] [data-premium-home="logo-editor"] > div > div:first-child { padding:10px 0!important; border-bottom:1px solid var(--sheet-line)!important; }
[data-premium-sheet] [data-premium-home="logo-editor"] > div > div:first-child > div:last-child { background:var(--sheet-field)!important; border-color:var(--sheet-line)!important; }
[data-premium-sheet] input:not([type="checkbox"]):not([type="radio"]), [data-premium-sheet] textarea { background:var(--sheet-field)!important; border-color:var(--sheet-line)!important; color:var(--sheet-ink)!important; border-radius:12px!important; min-height:44px; box-shadow:none!important; }
[data-premium-sheet] input::placeholder, [data-premium-sheet] textarea::placeholder { color:var(--sheet-muted)!important; }
[data-premium-sheet] [data-home-profile="editor"] { border:0!important; background:transparent!important; padding:0!important; margin:0!important; box-shadow:none!important; }
[data-home-profile="modules"] { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:24px 32px!important; }
[data-premium-sheet] [data-home-profile="module"] { background:transparent!important; border:0!important; border-radius:0!important; padding:18px 0 0!important; box-shadow:none!important; border-top:1px solid var(--sheet-line)!important; }
[data-premium-sheet] [data-home-profile="module"] [dir="auto"] { color:var(--sheet-ink); }
[data-premium-sheet] [data-home-profile="editor"] > [dir="auto"]:first-child { font-family:Georgia,serif; font-size:23px; font-weight:500; color:var(--sheet-ink); }
[data-premium-sheet] [data-home-profile="editor"] > [dir="auto"]:nth-child(2) { font-size:13px; font-weight:400; color:var(--sheet-muted); margin-bottom:20px; }
[data-premium-sheet="invite"] [data-premium-home="invite"] { background:none!important; padding:0!important; margin:0!important; border:0!important; box-shadow:none!important; }
[data-premium-sheet="invite"] [data-premium-home="invite"] > [role="heading"] { display:none; }
[data-premium-sheet="invite"] [data-premium-home="link"], [data-premium-sheet="invite"] [data-premium-home="qr"] { background:transparent!important; border:0!important; box-shadow:none!important; padding:12px!important; }
[data-premium-sheet="invite"] [data-premium-home="qr"] { border-left:1px solid var(--sheet-line)!important; border-radius:0!important; }
[data-premium-sheet="invite"] [data-premium-home="invite"] { display:grid!important; grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important; gap:18px 32px!important; padding:12px!important; }
[data-premium-sheet="invite"] [data-premium-home="invite"] > [dir="auto"]:first-child { display:none!important; }
[data-premium-sheet="invite"] [data-premium-home="link"] { grid-row:1!important; padding:24px!important; gap:16px!important; justify-content:center!important; }


[data-premium-sheet="invite"] [data-premium-home="qr"] { grid-row:1 / span 2!important; display:flex!important; flex-direction:column!important; align-items:center!important; gap:12px!important; padding:18px 24px!important; }
[data-premium-sheet="invite"] [data-premium-home="qr-title"] { font-family:Georgia,serif; font-size:27px!important; color:var(--sheet-ink)!important; }
[data-premium-sheet="invite"] [data-premium-home="qr-subtitle"] { color:var(--sheet-muted)!important; font-size:14px!important; }
[data-premium-sheet="invite"] [data-premium-home="qr-frame"] { padding:12px!important; background:white!important; border-radius:16px!important; border:0!important; box-shadow:none!important; }
[data-premium-sheet="invite"] [data-premium-home="qr"] svg { width:196px!important; height:196px!important; }
[data-premium-sheet="invite"] [data-premium-home="qr-badge"] { width:100%!important; align-items:center!important; gap:8px!important; }
[data-premium-sheet="invite"] [aria-label^="Codice salone"] { max-width:100%!important; background:var(--sheet-field)!important; border-color:var(--sheet-line)!important; box-shadow:none!important; }
[data-premium-sheet="invite"] [aria-label^="Codice salone"] > [dir="auto"] { font-size:38px!important; color:var(--sheet-ink)!important; }
[data-premium-sheet="invite"] [aria-label^="Codice salone"] [dir="auto"] { color:var(--sheet-muted); }
[data-premium-sheet="invite"] [data-premium-home="print"] { min-height:50px!important; margin:0 24px!important; grid-row:2!important; border:1px solid var(--sheet-line)!important; background:var(--sheet-field)!important; box-shadow:none!important; }
[data-premium-sheet="invite"] { background-image:radial-gradient(ellipse at 10% 0%,#ffffff38,transparent 60%); }
[data-premium-sheet="invite"] [data-premium-home="invite"] { grid-template-columns:minmax(0,1.1fr) minmax(0,1fr)!important; gap:18px 30px!important; padding:16px 12px 8px!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-glow"] { display:none!important; }
[data-premium-sheet="invite"] [data-premium-home="link"] { gap:18px!important; padding:22px 0!important; background:none!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-label"] { background:none!important; color:var(--sheet-muted)!important; font-size:11px!important; letter-spacing:2px; }
[data-premium-sheet="invite"] [data-premium-home="invite-name"] { background:none!important; color:var(--sheet-ink)!important; font-family:Georgia,serif!important; font-size:48px!important; font-weight:400!important; line-height:1.15!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-description"] { background:none!important; color:var(--sheet-muted)!important; font-size:16px!important; line-height:24px; margin:0 0 8px!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-url"] { min-height:56px!important; justify-content:center!important; border:1px solid var(--sheet-line)!important; background:var(--sheet-field)!important; padding:12px 16px!important; border-radius:12px!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-url"] [dir="auto"] { color:var(--sheet-ink)!important; font-size:13px!important; line-height:20px!important; text-align:left!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-share"] { background:${p.action}!important; border:1px solid ${p.border}!important; border-radius:12px!important; min-height:60px!important; width:100%!important; max-width:none!important; margin:0!important; box-shadow:inset 0 1px 0 #ffffff30!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-share"] [dir="auto"] { color:${p.actionText}!important; font-size:16px!important; }
[data-premium-sheet="invite"] [data-premium-home="qr"] { background:${p.night?'rgba(208,181,139,.05)':'rgba(220,204,181,.16)'}!important; border:1px solid var(--sheet-line)!important; border-radius:18px!important; padding:22px!important; gap:14px!important; }
[data-premium-sheet="invite"] [data-premium-home="qr-title"] { font-family:system-ui,sans-serif!important; font-size:19px!important; font-weight:500!important; }
[data-premium-sheet="invite"] [data-premium-home="qr-subtitle"] { display:none!important; }
[data-premium-sheet="invite"] [data-premium-home="qr-badge"] { border-top:1px solid var(--sheet-line)!important; padding-top:16px!important; margin-top:2px!important; }
[data-premium-sheet="invite"] [aria-label^="Codice salone"] { border:0!important; background:transparent!important; padding:0 8px!important; margin:8px 0!important; }
[data-premium-sheet="invite"] [data-premium-home="print"] { margin:0!important; min-height:60px!important; border-radius:12px!important; align-self:start!important; }
[data-premium-sheet="invite"] [data-premium-home="print"] [dir="auto"] { color:var(--sheet-ink)!important; font-size:15px!important; }
[data-premium-sheet="invite"] [data-premium-home="invite-label"] {margin:0!important;line-height:16px!important;letter-spacing:1px!important;}
[data-premium-sheet="invite"] [data-premium-home="invite-name"] {margin:0!important;}
[data-premium-sheet="invite"] [data-premium-home="invite-description"] {margin:0!important;}
[data-premium-sheet="invite"] [data-premium-home="link"] {gap:12px!important;}
[data-premium-sheet="invite"] [data-premium-home="invite-share"], [data-premium-sheet="invite"] [data-premium-home="print"] {min-height:48px!important;}
@media(max-width:760px){
 [data-premium-sheet="invite"] [data-premium-home="invite"]{grid-template-columns:minmax(0,1fr)!important;padding:0!important;gap:16px!important;}
 [data-premium-sheet="invite"] [data-premium-home="invite"] > * {grid-column:1!important;grid-row:auto!important;min-width:0!important;max-width:100%!important;}
 [data-premium-sheet="invite"] [data-premium-home="link"]{padding:0!important;gap:12px!important;}
 [data-premium-sheet="invite"] [data-premium-home="invite-name"]{font-size:32px!important;}
 [data-premium-sheet="invite"] [data-premium-home="invite-description"]{font-size:13px!important;line-height:20px!important;}
 [data-premium-sheet="invite"] [data-premium-home="invite-url"] [dir="auto"]{overflow-wrap:anywhere!important;}
 [data-premium-sheet="invite"] [data-premium-home="qr"]{padding:16px!important;}
 [data-premium-sheet="invite"] [data-premium-home="qr-frame"]{width:100%!important;max-width:220px!important;box-sizing:border-box;}
 [data-premium-sheet="invite"] [data-premium-home="qr"] svg{width:100%!important;max-width:196px!important;height:auto!important;aspect-ratio:1;}
 [data-premium-sheet="invite"] [data-premium-home="print"]{align-self:stretch!important;}
}
@media(max-width:700px) { [data-home-profile="modules"] { grid-template-columns:minmax(0,1fr); gap:18px!important; } [data-premium-sheet="invite"] [data-premium-home="qr"] { border-left:0!important; border-top:1px solid var(--sheet-line)!important; } }
`)}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: compactRequests?8:12, paddingHorizontal: compactRequests?16:24, paddingVertical: compactRequests?14:18, borderBottomWidth: 1, borderBottomColor: p.line }}>
        <Ionicons name={icon} size={compactRequests?20:kind==='invite'?28:24} color={p.ink} /><View style={{flex:1,gap:6}}><Text accessibilityRole="header" style={{color:p.ink,fontSize:compactRequests?23:27,lineHeight:compactRequests?27:undefined,fontFamily:'Georgia'}}>{title}</Text>{kind==='invite'?<Text style={{color:p.muted,fontSize:13,lineHeight:19}}>Un link, un invito. Il tuo salone sempre a portata di mano.</Text>:null}</View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Chiudi ${title}`} disabled={dismissDisabled} onPress={onClose} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', alignSelf:'flex-start', flexShrink:0, gap: 8, minHeight: 40, paddingHorizontal: 12, borderWidth: 1, borderColor: p.border, borderRadius: 11, backgroundColor: p.field, opacity: pressed || dismissDisabled ? .55 : 1 })}>{width>=480?<Text style={{ color: p.ink, fontSize: 12 }}>Chiudi</Text>:null}<Ionicons name="close-outline" size={19} color={p.ink} /></Pressable>
      </View>
      <ScrollView ref={scrollRef} style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ padding: compactRequests?16:24, paddingBottom: 32 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>{children}</ScrollView>
      {footer ? <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: p.line, ...popupGlass(p, 'footer') }}>{footer}</View> : null}
    </View>
  </View>;
}
export function OwnerPremiumPopup(props: Props) {
  if (Platform.OS !== 'web') return <>{props.children}</>;
  return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible transparent animationType="fade" onRequestClose={() => { if (!props.dismissDisabled) props.onClose(); }}><OwnerPremiumSheetFrame {...props} /></Modal>;
}
