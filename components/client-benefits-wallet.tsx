import { useAccessAppearance } from './access-premium';
import { customerPortalStyles } from './customer-portal-styles';
import { useCustomerShopAttention } from "../src/lib/use-customer-shop-attention";
import { ShopAttentionDot } from "./shop/shop-attention";
import { ClientPackageStorefront } from './client-package-storefront';
import { loyaltyMoney, loyaltyRuleSummary } from '../src/lib/loyalty-earning';
import { CreationSheet } from "./creation-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { benefitsDesign as customerBenefitsBase } from "./benefits-design";
import * as Notifications from "expo-notifications";
import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Modal,
  StyleSheet,
  useWindowDimensions,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  authenticateCustomerPayment,
  type PaymentIdentity,
} from "../src/lib/client-payment-session";
import {
  benefitStatus,
  benefitToday,
  loadCustomerBenefits,
  type BenefitsWallet as Wallet,
} from "../src/lib/customer-benefits";
import {
  subscribePackageChanges,
  packageMoney,
} from "../src/lib/service-packages";
import { GiftCardDocument } from "./gift-card-document";
import { HapticTouchable } from "./ui/haptic-touchable";
export function ClientBenefitsWallet({
  identity,
  historyOnly = false,
  compactEntry = false,
  fullWidth = false,
  centered = false,
  active = true,
}: {
  identity: PaymentIdentity;
  historyOnly?: boolean;
  compactEntry?: boolean;
  fullWidth?: boolean;
  centered?: boolean;
  active?: boolean;
}) {
  const { palette: customerPalette } = useAccessAppearance();
  const d = React.useMemo(() => customerPortalStyles(customerBenefitsBase, customerPalette), [customerPalette]);
  const styles = React.useMemo(() => {
    const themed = customerPortalStyles(customerBaseStyles, customerPalette);
    if (!centered) return themed;
    return { ...themed,
      shell: { ...themed.shell, marginVertical: 0, borderRadius: 17 },
      header: { ...themed.header, padding: 14, gap: 8 },
      headerCompact: { ...themed.headerCompact, padding: 14, gap: 8 },
      headerRow: { ...themed.headerRow, minHeight: 36 },
      headerText: { ...themed.headerText, paddingHorizontal: 35, alignItems: 'center' as const },
      icon: { ...themed.icon, width: 32, height: 32, borderRadius: 11 },
      compactIcon: { ...themed.compactIcon, width: 32, height: 32, borderRadius: 11 },
      heading: { ...themed.heading, fontSize: 16, lineHeight: 22, textAlign: 'center' as const },
      compactHeading: { ...themed.compactHeading, fontSize: 16, lineHeight: 22, textAlign: 'center' as const },
      eyebrow: { ...themed.eyebrow, fontSize: 9, lineHeight: 13, textAlign: 'center' as const },
    };
  }, [customerPalette, centered]);
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const availableWidth = containerWidth || windowWidth;
  const compact = availableWidth / fontScale < 480;
  const stacked = availableWidth / fontScale < 300;
  const [open, setOpen] = useState(false);
  const shopAttention = useCustomerShopAttention(identity, historyOnly);
  useEffect(() => { if (!active) setOpen(false); }, [active]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const identityKey = [identity.salonCode, identity.email, identity.phone].join(
    "|",
  );
  useEffect(() => {
    const listener = Notifications.addNotificationReceivedListener(notification => {
      if (notification.request.content.data?.benefitEventId) setRevision(v=>v+1);
    });
    return () => listener.remove();
  }, []);
  useEffect(() => subscribePackageChanges(() => setRevision((v) => v + 1)), []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") setRevision((v) => v + 1);
    });
    return () => sub.remove();
  }, []);
  const hasWallet = !!wallet;
  useEffect(() => {
    if (!open || !hasWallet) return;
    const timer = setInterval(() => {
      const visible = Platform.OS === "web" ? document.visibilityState !== "hidden" : AppState.currentState === "active";
      if (visible) setRevision(v => v + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, [open, hasWallet]);
  useEffect(() => {
    setWallet(null);
    setError("");
    setPassword("");
    generation.current++;
  }, [identityKey]);
  useEffect(() => {
    if (open) void load();
    return () => {
      // Invalidates pending requests, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, identityKey, revision]);
  const load = async (verify = false) => {
    const request = ++generation.current;
    if (!wallet || verify) setBusy(true);
    setError("");
    try {
      if (verify) await authenticateCustomerPayment(identity, password);
      const data = await loadCustomerBenefits(identity);
      if (request !== generation.current) return;
      setPassword("");
      setWallet(data);
    } catch (e) {
      if (request === generation.current) {
        setWallet(null);
        setError((e as Error).message);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  };
  const dateLabel = (value: string) => value.split("-").reverse().join("/");
  const badge = (label: string) => <View style={styles.badge}><Text style={styles.badgeText}>{label}</Text></View>;
  const empty = (title: string, copy: string) => <View style={[styles.empty, historyOnly && styles.emptyCompact]}>{!historyOnly ? <Ionicons name="gift-outline" size={30} color={customerPalette.muted}/> : null}<Text style={styles.title}>{title}</Text><Text style={[d.copy, {textAlign:historyOnly ? "left" : "center"}]}>{copy}</Text></View>;
  return <View style={[styles.shell, fullWidth && {width:'100%',alignSelf:'stretch'}, compactEntry && {marginTop:0,marginBottom:0,padding:0,borderWidth:0,backgroundColor:'transparent',shadowOpacity:0}]} onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}>
    {compactEntry ? <HapticTouchable onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityLabel="Pacchetti e vantaggi" accessibilityState={{expanded:open}} style={{minHeight:51,flexDirection:'row',alignItems:'center',gap:11}}><Ionicons name="gift-outline" size={19} color={customerPalette.muted}/><Text style={{flex:1,color:customerPalette.ink,fontSize:12,lineHeight:19}}>Pacchetti e vantaggi</Text><Ionicons name="chevron-forward" size={15} color={customerPalette.muted}/></HapticTouchable> : <HapticTouchable onPress={() => setOpen(v => !v)} accessibilityRole="button" accessibilityState={{expanded:open}} style={[styles.header, compact && styles.headerCompact]}>
      <View style={styles.headerRow}>
        <View style={[styles.icon, compact && styles.compactIcon, centered && {position:'absolute',left:0}]}><Ionicons name={historyOnly ? "notifications-outline" : "gift-outline"} size={centered ? 19 : compact ? 22 : 25} color={customerPalette.muted}/><ShopAttentionDot active={historyOnly && shopAttention}/></View>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>{historyOnly ? "DAL TUO SALONE" : "IL TUO PORTAFOGLIO"}</Text>
          {!stacked ? <Text style={[styles.heading, compact && styles.compactHeading]}>{historyOnly ? "Vantaggi e ordini" : "I tuoi pacchetti e vantaggi"}</Text> : null}
        </View>
        <Ionicons name={!historyOnly ? "chevron-forward" : open ? "chevron-up" : "chevron-down"} size={20} color={customerPalette.muted} style={centered?{position:'absolute',right:0}:undefined}/>
      </View>
      {stacked ? <Text style={[styles.heading, styles.compactHeading]}>{historyOnly ? "Vantaggi e ordini" : "I tuoi pacchetti e vantaggi"}</Text> : null}
      <Text style={[d.copy,centered&&{fontSize:12,lineHeight:18,textAlign:'center'}]}>{historyOnly ? "Aggiornamenti su vantaggi e ritiri in salone." : "Servizi, credito e premi. Tutto qui."}</Text>
    </HapticTouchable>}
    {open ? <WalletPresentation inline={historyOnly} onClose={() => setOpen(false)}><View style={[styles.content, !historyOnly && {padding:0}]}>
      {busy ? <View style={styles.row}><ActivityIndicator color={customerPalette.muted}/><Text style={d.copy}>Aggiornamento in corso…</Text></View> : null}
      {error ? <View style={styles.error}><Text accessibilityRole="alert" style={{color:customerPalette.ink,lineHeight:21}}>{error}</Text></View> : null}
      {error.toLowerCase().includes("password") ? <View style={d.card}><Text style={styles.title}>Accedi ai tuoi vantaggi</Text><Text style={d.copy}>Conferma la password del tuo account per visualizzare saldi e premi.</Text><TextInput secureTextEntry autoCapitalize="none" accessibilityLabel="Password per i vantaggi" placeholder="La tua password" placeholderTextColor="#818897" value={password} onChangeText={setPassword} style={d.input}/><HapticTouchable disabled={busy || !password} onPress={() => void load(true)} style={[d.primary,{opacity:busy || !password ? 0.5 : 1}]}><Text style={d.primaryText}>Verifica account</Text></HapticTouchable></View> : null}
      {historyOnly && wallet ? <View style={{gap:12}}>
        {shopAttention ? <View style={[styles.notice,{flexDirection:"row",alignItems:"center",gap:8}]}><View style={{width:10,height:10,borderRadius:5,backgroundColor:customerPalette.field}}/><Text style={styles.body}>Hai ordini in sospeso: consulta lo shop per il ritiro.</Text></View> : null}
        {!wallet.notifications?.length ? empty("Nessuna novità, per ora", "Pacchetti, regali, premi e aggiornamenti degli ordini compariranno qui automaticamente.") : null}
        {wallet.notifications?.map(n => <View key={n.id} style={styles.notice}>
          <View style={styles.row}><View style={styles.smallIcon}><Ionicons name="gift-outline" size={19} color={customerPalette.muted}/></View><Text style={[styles.eyebrow,{flex:1}]}>{new Date(n.created_at).toLocaleDateString("it-IT", {day:"numeric",month:"long",year:"numeric"})}</Text><Text style={styles.meta}>{new Date(n.created_at).toLocaleTimeString("it-IT",{hour:"2-digit",minute:"2-digit"})}</Text></View>
          <Text style={styles.title}>{n.title}</Text><Text style={styles.body}>{n.body}</Text>
        </View>)}
      </View> : null}
      {!historyOnly && wallet ? <>
        <ClientPackageStorefront key={identityKey} identity={identity}/>
        {wallet.packages.map(p => <View key={p.id} style={d.card}>
          <View style={styles.row}><Ionicons name="layers-outline" size={21} color={customerPalette.muted}/><Text style={styles.eyebrow}>ABBONAMENTO</Text></View>
          <Text style={styles.title}>{p.name}</Text>
          <View style={styles.row}>{badge(benefitStatus(p.available,p.expires_on,undefined,p.starts_on))}</View>
          <View style={styles.metrics}>{[[p.available,"Disponibili"],[p.reserved,"Prenotati"],[p.consumed,"Utilizzati"]].map(([value,label]) => <View key={label} style={[styles.metric, {minWidth: Math.min(Math.max(76, 76 * fontScale), Math.max(76, availableWidth - 72))}]}><Text style={styles.number}>{value}</Text><Text style={[styles.meta,{textAlign:"center"}]}>{label}</Text></View>)}</View>
          <Text style={styles.body}>{p.entitlements.map(e=>e.name).join(" · ")}</Text>
          <Text style={d.copy}>Dal {dateLabel(p.starts_on)} al {dateLabel(p.expires_on)}</Text>
        </View>)}
        {wallet.settings.loyalty_enabled || wallet.points !== 0 ? <View style={d.card}>
          <View style={styles.row}><Ionicons name="heart-outline" size={22} color={customerPalette.muted}/><Text style={styles.eyebrow}>FEDELTÀ</Text></View>
          <View style={[styles.row,{alignItems:"baseline"}]}><Text style={styles.balance}>{wallet.points}</Text><Text style={d.copy}>punti accumulati</Text></View>
          {wallet.settings.loyalty_enabled ? <View style={{gap:6}}><Text style={[d.copy,{fontWeight:"600",color:customerPalette.ink}]}>{loyaltyRuleSummary(wallet.settings)}</Text>
            {wallet.settings.loyalty_rule_description ? <Text style={d.copy}>{wallet.settings.loyalty_rule_description}</Text> : null}
            {wallet.settings.loyalty_earning_mode === 'spend' ? <Text style={d.copy}>Sugli importi incassati {wallet.settings.loyalty_spend_services && wallet.settings.loyalty_spend_products ? 'per servizi effettuati e prodotti' : wallet.settings.loyalty_spend_products ? 'per i prodotti' : 'per i servizi effettuati'}. {wallet.settings.loyalty_spend_carry ? 'Gli importi residui si sommano tra visite.' : 'I punti si calcolano su ogni singola operazione.'} {(wallet.settings.loyalty_minimum_cents || 0) > 0 ? `Spesa minima: ${loyaltyMoney(wallet.settings.loyalty_minimum_cents!)} per operazione. ` : ''}Sconti, rimborsi, quote gift card e acquisto di pacchetti sono esclusi.</Text> : null}
          </View> : <Text style={d.copy}>Nuovi accumuli sospesi. Puoi usare i punti già maturati.</Text>}
          {!wallet.rewards.length ? <Text style={d.copy}>Il salone ti farà conoscere i premi disponibili.</Text> : null}
          {wallet.rewards.map(r => {
            const expired = !!r.expires_on && r.expires_on < benefitToday();
            const ready = !expired && wallet.points >= r.points_cost;
            return <View key={r.id} style={styles.reward}><View style={[styles.row,{justifyContent:"space-between",flexWrap:"wrap"}]}><Text style={styles.title}>{r.name}</Text>{badge(`${r.points_cost} punti`)}</View>
              {r.reward_type === "percent" ? <Text style={styles.rewardValue}>{r.value}% di sconto</Text> : r.reward_type === "fixed" ? <Text style={styles.rewardValue}>{packageMoney(Math.round((r.value || 0)*100))} di sconto</Text> : null}
              {r.description ? <Text style={styles.body}>{r.description}</Text> : null}
              <Text style={{color:ready ? customerPalette.ink : customerPalette.ink,fontWeight:"600"}}>{expired ? "Premio scaduto" : ready ? "Puoi richiederlo in cassa" : `Ti mancano ${r.points_cost-wallet.points} punti`}</Text>
              {r.expires_on ? <Text style={styles.meta}>Valido fino al {dateLabel(r.expires_on)}</Text> : null}
            </View>;
          })}
          <Text style={d.copy}>Il salone applica il premio in cassa. I punti vengono scalati alla conferma.</Text>
        </View> : null}
        {wallet.giftCards.map(g => <View key={g.id} style={styles.gift}>
          <View style={[styles.row,{justifyContent:"space-between",flexWrap:"wrap"}]}><View style={styles.row}><Ionicons name="gift-outline" size={23} color={customerPalette.muted}/><Text style={styles.eyebrow}>GIFT CARD</Text></View>{badge(benefitStatus(g.available_cents,g.expires_on))}</View>
          <View><Text style={styles.balance}>{packageMoney(g.available_cents)}</Text><Text style={d.copy}>Credito residuo</Text></View>
          {g.message ? <Text style={styles.body}>{g.message}</Text> : null}
          <View style={styles.code}><Text style={styles.meta}>IL TUO CODICE</Text><Text selectable style={{color:customerPalette.ink,fontWeight:"700",fontSize:16,letterSpacing:1}}>{g.code}</Text></View>
          <Text style={d.copy}>{g.expires_on ? `Valida fino al ${dateLabel(g.expires_on)}` : "Senza scadenza"}</Text>
          <GiftCardDocument gift={g}/><Text style={d.copy}>Mostrala al salone per utilizzarla sul tuo appuntamento.</Text>
        </View>)}
        {!wallet.packages.length && !wallet.giftCards.length && !wallet.points ? empty("Il tuo prossimo vantaggio ti aspetta", "Non hai ancora pacchetti o credito assegnati. Scopri con il salone le iniziative disponibili.") : null}
        <View style={styles.initiatives}><Text style={styles.eyebrow}>LE INIZIATIVE DEL SALONE</Text><View style={{gap:10}}>{([["packages_enabled","Abbonamenti"],["loyalty_enabled","Punti fedeltà"],["gift_cards_enabled","Gift card"]] as const).map(([key,label]) => <View key={key} style={[styles.row,{justifyContent:"space-between",flexWrap:"wrap"}]}><Text style={styles.body}>{label}</Text><Text style={{color:wallet.settings[key] ? customerPalette.ink : customerPalette.ink,fontSize:13,fontWeight:"600"}}>{wallet.settings[key] ? "Attivi" : "Nuove adesioni sospese"}</Text></View>)}</View><Text style={d.copy}>I vantaggi già acquisiti restano validi secondo le loro condizioni.</Text></View>
      </> : null}
      {error && !error.toLowerCase().includes("password") ? <HapticTouchable disabled={busy} onPress={() => void load()} style={[d.secondary,styles.row,{opacity:busy ? 0.5 : 1}]}><Ionicons name="refresh-outline" size={18} color={customerPalette.muted}/><Text style={d.secondaryText}>Riprova</Text></HapticTouchable> : null}
    </View></WalletPresentation> : null}
  </View>;
}
function WalletPresentation({ inline, onClose, children }: React.PropsWithChildren<{inline:boolean; onClose:()=>void}>) {
  const { palette: customerPalette } = useAccessAppearance();
  const d = React.useMemo(() => customerPortalStyles(customerBenefitsBase, customerPalette), [customerPalette]);
  if (inline) return <>{children}</>;
  return <Modal visible transparent animationType="none" onRequestClose={onClose}>
    <GestureHandlerRootView style={{flex:1}}>
      <CreationSheet premiumWeb premiumKind="customer" title="I tuoi pacchetti e vantaggi" icon="gift-outline" onClose={onClose} animatePresentation keepFocusedFieldVisible fillAvailableHeight>
        {children}
        <HapticTouchable accessibilityRole="button" onPress={onClose} style={[d.primary,{marginTop:16}]}><Text style={d.primaryText}>Chiudi e continua</Text></HapticTouchable>
      </CreationSheet>
    </GestureHandlerRootView>
  </Modal>;
}
const styles = StyleSheet.create({
  shell:{backgroundColor:"#FFFAFC",borderWidth:1,borderColor:"#EBDDE4",borderRadius:26,marginVertical:12,overflow:"hidden"},
  header:{gap:12,padding:20},
  headerCompact:{padding:16,gap:10},
  headerRow:{flexDirection:"row",alignItems:"center",gap:12},
  headerText:{flex:1,minWidth:0,gap:5},
  compactIcon:{width:40,height:40,borderRadius:14},
  compactHeading:{fontSize:18,lineHeight:24},
  icon:{width:48,height:48,borderRadius:17,backgroundColor:"#F8E5ED",alignItems:"center",justifyContent:"center"},
  smallIcon:{width:34,height:34,borderRadius:12,backgroundColor:"#F8E5ED",alignItems:"center",justifyContent:"center"},
  heading:{fontSize:20,fontWeight:"800",color:"#302A35",lineHeight:26},
  eyebrow:{fontSize:11,fontWeight:"800",letterSpacing:1.1,color:"#956279"},
  content:{padding:16,paddingTop:4,gap:14},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:9},
  title:{fontSize:17,fontWeight:"700",color:"#302A35",flexShrink:1,lineHeight:23},
  body:{fontSize:15,color:"#4B5362",lineHeight:22},meta:{fontSize:12,color:"#737B88",lineHeight:18},
  badge:{maxWidth:"100%",backgroundColor:"#F4E9EF",borderRadius:20,paddingHorizontal:11,paddingVertical:6},badgeText:{fontSize:12,fontWeight:"600",color:"#87435C"},
  empty:{alignItems:"center",padding:24,gap:12,backgroundColor:"#FFFFFF",borderRadius:20},
  emptyCompact:{padding:14,gap:6,alignItems:"flex-start"},
  error:{padding:14,borderRadius:14,backgroundColor:"#FFF0F2"},
  notice:{padding:17,borderRadius:20,backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#ECE3E9",gap:12},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:12,backgroundColor:"#F8F4F7",borderRadius:15,paddingVertical:13},metric:{flex:1,alignItems:"center",gap:3},number:{fontSize:23,fontWeight:"800",color:"#64354C"},
  balance:{flexShrink:1,fontSize:32,fontWeight:"800",color:"#87334F"},
  reward:{padding:14,borderRadius:16,backgroundColor:"#F8F4F7",gap:9},rewardValue:{fontSize:20,fontWeight:"700",color:"#963B57"},
  gift:{padding:18,borderRadius:22,backgroundColor:"#FFF0F5",borderWidth:1,borderColor:"#E9CDDA",gap:14},
  code:{padding:13,borderRadius:13,backgroundColor:"#FFFFFF",gap:5},
  initiatives:{padding:16,gap:14},
});

const customerBaseStyles = styles;
