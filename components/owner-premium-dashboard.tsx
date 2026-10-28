import {useCashDevicePrivacy} from '../src/lib/cash-device-privacy';
import {useRouter} from 'expo-router';
import { OwnerPremiumPopup } from './owner-premium-sheet';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';

type Slots = Record<'heading' | 'date' | 'status' | 'appointments' | 'unpaid' | 'clientTotal' | 'income' | 'priority' | 'operators' | 'customers' | 'focus' | 'finance' | 'summary' | 'indicators' | 'profile' | 'invite' | 'shop' | 'admin' | 'reminder', React.ReactNode>;
const mark = (value: string) => ({ dataSet: { ownerHome: value } });
function LiveHomeClock() {
  const {palette:p}=useAccessAppearance();
  const format=()=>new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date());
  const [time,setTime]=useState(format);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const tick=()=>{setTime(format());timer=setTimeout(tick,60000-Date.now()%60000+20);};
    tick(); return()=>clearTimeout(timer);
  },[]);
  return <Text accessibilityLabel={`Ora attuale ${time}`} style={{color:p.ink,fontSize:14,fontWeight:'600',fontVariant:['tabular-nums'],flexShrink:0,paddingLeft:10,borderLeftWidth:1,borderLeftColor:p.line}}>{time}</Text>;
}
/** Web composition only: slots contain the original Home controls and live data. */
type SecondaryMetric={label:string;value:string;hint:string;icon:React.ComponentProps<typeof Ionicons>['name']};
export function OwnerPremiumDashboard({ privacyScope, secondaryMetrics, slots: s, profileProgress, profileOpen, inviteLabel, today }: { privacyScope:string; secondaryMetrics:SecondaryMetric[]; slots: Slots; profileProgress: string; profileOpen: boolean; inviteLabel: string; today: string }) {
  const { palette: p } = useAccessAppearance();
  const router=useRouter();const {enabled:cashPrivacy}=useCashDevicePrivacy(privacyScope);const reserveFinance=cashPrivacy!==false;
  const reserved=<Pressable accessibilityRole="button" accessibilityLabel="Apri Cassa riservata" onPress={()=>router.push('/cassa' as any)} style={{padding:18,gap:12,flexDirection:'row',alignItems:'center',borderWidth:1,borderColor:p.border,borderRadius:16,backgroundColor:p.night?'#30362F':'#E7E9DE'}}><Ionicons name="lock-closed-outline" size={23} color={p.ink}/><View style={{flex:1,minWidth:0,gap:6}}><Text style={{color:p.ink,fontSize:15,fontWeight:'600'}}>Riservato al titolare</Text><Text style={{color:p.muted,fontSize:12,lineHeight:18}}>Apri Cassa per consultare gli importi.</Text></View><Ionicons name="chevron-forward" size={18} color={p.muted}/></Pressable>;
  const dateLabel = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${today}T12:00:00`));
  const [inviteOpen, setInviteOpen] = useState(false);
  const title = (text: string, icon: React.ComponentProps<typeof Ionicons>['name']) => <View {...mark('section-heading')}><Ionicons name={icon} size={20} color={p.ink} /><Text accessibilityRole="header" style={{ color: p.ink, fontFamily: 'Georgia', fontSize: 22 }}>{text}</Text></View>;
  const stat = (part: string, icon: React.ComponentProps<typeof Ionicons>['name'], node: React.ReactNode) => <View {...mark(`stat-${part}`)}><View {...mark('stat-icon')}><Ionicons name={icon} size={24} color={p.ink} /></View><View {...mark('stat-copy')}>{node}</View></View>;
  return <View {...mark('root')}>
    {React.createElement('style', null, `
[data-owner-home="root"] { --ink:${p.ink}; --muted:${p.muted}; --surface:${p.night ? 'rgba(31,36,33,.95)' : 'rgba(248,246,240,.95)'}; --field:${p.night ? 'rgba(255,255,255,.035)' : 'rgba(255,253,250,.3)'}; --rim:${p.border}; --divider:${p.night ? '#ffffff20' : '#B5AA9944'}; --action:${p.action}; --action-text:${p.actionText}; --tone-sand:${p.night ? 'rgba(216,194,155,.09)' : 'rgba(240,229,209,.58)'}; --tone-amber:${p.night ? 'rgba(201,150,88,.13)' : 'rgba(250,233,206,.66)'}; --tone-sage:${p.night ? 'rgba(134,163,128,.12)' : 'rgba(228,236,219,.66)'}; --tone-neutral:${p.night ? 'rgba(255,255,255,.035)' : 'rgba(255,253,249,.5)'}; --gold:${p.night ? '#D8C29B' : '#8F6D3B'}; display:flex; flex-direction:column; gap:14px; min-width:0; }
[data-owner-home="root"] * { min-width:0; }
${p.night ? '[data-owner-home="root"] { isolation:isolate; } [data-owner-home="root"]::before { content:""; position:fixed; inset:0; background:rgba(0,0,0,.58); z-index:0; pointer-events:none; } [data-owner-home="root"] > * { position:relative; z-index:1; } @media(max-width:999px){[data-owner-home="root"]::before{left:0;}}' : ''}

[data-owner-home="header"] { flex-direction:row; justify-content:space-between; align-items:center; gap:20px; min-height:124px; }
[data-owner-home="header"] [data-premium-home="heading"] { padding:0; }
[data-owner-home="header"] [role="heading"] { font-size:54px!important; line-height:1.1; }
[data-owner-home="date"] { max-width:100%; flex-direction:row; align-items:center; gap:10px; padding:12px 18px; flex-shrink:0; border:1px solid var(--divider); border-radius:28px; background:var(--field); text-transform:capitalize; }
[data-owner-home="stats"] { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:10px; }
[data-owner-home^="stat-"]:not([data-owner-home="stat-copy"]):not([data-owner-home="stat-icon"]) { min-height:106px; flex-direction:row; align-items:center; gap:15px; padding:16px 18px; border:1px solid var(--rim); border-radius:16px; box-shadow:inset 0 1px 0 #ffffff44; }
[data-owner-home="stat-appointments"] { background:var(--tone-sand); }
[data-owner-home="stat-unpaid"] { background:var(--tone-amber); }
[data-owner-home="stat-clients"] { background:var(--tone-sand); }
[data-owner-home="stat-income"] { background:var(--tone-sage); }
[data-owner-home="stat-icon"], [data-owner-home="finance-icon"] { width:44px; height:44px; flex-shrink:0; justify-content:center; align-items:center; border-radius:22px; background:rgba(147,132,112,.055); }
[data-owner-home="stat-copy"], [data-owner-home="finance-copy"] { flex:1; }
[data-owner-home="stat-copy"] > div, [data-owner-home="finance-copy"] > div { border:0!important; background:none!important; box-shadow:none!important; padding:0!important; margin:0!important; min-width:0!important; width:100%!important; align-items:center!important; }
[data-owner-home="stat-copy"] [dir="auto"], [data-owner-home="finance-copy"] [dir="auto"] { white-space:normal; text-align:center!important; color:var(--ink)!important; font-size:14px!important; font-weight:400!important; }
[data-owner-home="stat-copy"] > div > div:nth-child(n+3), [data-owner-home="finance-copy"] > div > div:nth-child(n+3) { display:none; }
[data-owner-home="stat-appointments"] [data-owner-home="stat-copy"] > div, [data-owner-home="stat-unpaid"] [data-owner-home="stat-copy"] > div { flex-direction:column-reverse; gap:4px; }
[data-owner-home="stat-copy"] > div > [dir="auto"] { width:100%!important; }
[data-owner-home="stat-appointments"] [data-owner-home="stat-copy"] > div > :first-child, [data-owner-home="stat-unpaid"] [data-owner-home="stat-copy"] > div > :first-child, [data-owner-home="stat-clients"] [data-owner-home="stat-copy"] > div > :nth-child(2) [dir="auto"], [data-owner-home="stat-income"] [data-owner-home="stat-copy"] > div > :nth-child(2) [dir="auto"], [data-owner-home="finance-copy"] > div > :nth-child(2) [dir="auto"] { font-size:clamp(24px,2.8vw,28px)!important; line-height:1.22!important; font-weight:600!important; white-space:nowrap; overflow-wrap:normal; word-break:normal; }
[data-owner-home="secondary-stats"] { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr)); gap:10px; }
[data-owner-home="secondary-stats"] > div { flex-direction:row; align-items:center; gap:12px; min-height:76px; padding:12px 16px; border:1px solid var(--rim); border-radius:14px; }
[data-owner-home="secondary-0"] { background:var(--tone-neutral); }
[data-owner-home="secondary-1"] { background:var(--tone-neutral); }
[data-owner-home="secondary-2"] { background:var(--tone-neutral); }
[data-owner-home="secondary-3"] { background:var(--tone-neutral); }
[data-owner-home="people"] [data-premium-home="people-stats"] { background:transparent!important; gap:8px!important; }
[data-owner-home="people"] [data-premium-home="people-stats"] > div { width:100%!important; max-width:none!important; border:0!important; border-radius:11px!important; }
[data-owner-home="people"] [data-premium-home="operators"] [data-premium-home="people-stats"] > div:nth-child(1) { background:${p.night?'rgba(141,176,151,.08)':'rgba(222,238,224,.4)'}!important; }
[data-owner-home="people"] [data-premium-home="operators"] [data-premium-home="people-stats"] > div:nth-child(2) { background:${p.night?'rgba(186,155,125,.08)':'rgba(249,231,213,.4)'}!important; }
[data-owner-home="people"] [data-premium-home="operators"] [data-premium-home="people-stats"] > div:nth-child(3) { background:${p.night?'rgba(156,139,183,.08)':'rgba(234,225,245,.4)'}!important; }
[data-owner-home="people"] [data-premium-home="customers"] [data-premium-home="people-stats"] > div:nth-child(1) { background:${p.night?'rgba(129,156,181,.08)':'rgba(222,234,246,.4)'}!important; }
[data-owner-home="people"] [data-premium-home="customers"] [data-premium-home="people-stats"] > div:nth-child(2) { background:${p.night?'rgba(186,169,123,.08)':'rgba(246,238,214,.4)'}!important; }
[data-owner-home="people"] [data-premium-home="customers"] [data-premium-home="people-stats"] > div:nth-child(3) { background:${p.night?'rgba(185,138,151,.08)':'rgba(246,225,231,.4)'}!important; }
@media(max-width:1250px){[data-owner-home="secondary-stats"] {grid-template-columns:repeat(2,minmax(0,1fr));}}
@media(max-width:580px){[data-owner-home="secondary-stats"] {grid-template-columns:minmax(0,1fr);}}
[data-owner-home="main"] { display:grid; grid-template-columns:minmax(0,1.95fr) minmax(270px,1fr); gap:14px; align-items:stretch; }
[data-owner-home="operations"], [data-owner-home="attention"], [data-owner-home="results"], [data-owner-home="indicators"], [data-owner-home="utilities"] { padding:15px; background:var(--surface); border:1px solid var(--rim); border-radius:17px; backdrop-filter:blur(22px); box-shadow:inset 0 1px 0 #ffffff55,0 5px 15px #49362305; }
[data-owner-home="section-heading"] { flex-direction:row; align-items:center; gap:10px; margin-bottom:12px; }
[data-owner-home="section-heading"] [role="heading"] { font-size:28px!important; font-weight:500; letter-spacing:-.7px; }
[data-owner-home="people"] { flex:1; align-items:stretch; align-content:stretch; grid-template-rows:minmax(0,1fr); display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr)); gap:10px; }
[data-owner-home="people"] > div { container-type:inline-size;container-name:home-person-card; min-height:190px; padding:16px!important; margin:0!important; height:100%!important; border:1px solid var(--rim)!important; border-radius:15px!important; background:var(--field)!important; box-shadow:none!important; }
[data-owner-home="people"] [data-premium-home="people-header"] { height:auto!important; min-height:42px!important; margin:0!important; align-items:center!important; }
[data-premium-home="people-header"] > div:first-child { padding-left:32px!important; }
[data-premium-home="people-header"] > div:first-child::before { content:"\\f4a3"; font-family:ionicons; font-size:25px; color:var(--ink); position:absolute; left:0; top:5px; }
[data-premium-home="operators"] [data-premium-home="people-header"] > div:first-child::before { content:"\\f4aa"; }
[data-premium-home="people-header"] > div:first-child > [dir="auto"] { font-family:Georgia,serif; font-size:22px!important; font-weight:500!important; color:var(--ink)!important; }
[data-premium-home="people-header"] > :last-child { width:40px!important; height:40px!important; min-width:40px!important; padding:0!important; justify-content:center!important; align-items:center!important; background-color:var(--field)!important; border:1px solid var(--rim)!important; border-radius:20px!important; box-shadow:inset 0 1px 0 ${p.night ? '#ffffff14' : '#ffffffaa'}!important; transition:background-color .18s ease-out; }
[data-premium-home="people-header"] > :last-child:hover { background-color:${p.night ? 'rgba(255,255,255,.08)' : 'rgba(255,253,250,.75)'}!important; }
[data-premium-home="people-header"] > :last-child [dir="auto"] { color:var(--ink)!important; }
[data-premium-home="people-caption"] { height:auto!important; min-height:24px!important; line-height:18px!important; padding:4px 0!important; margin:4px 0 10px!important; font-size:12.5px!important; font-weight:400!important; text-align:left!important; color:var(--muted)!important; }
[data-owner-home="people"] [data-premium-home="people-stats"] { min-height:74px!important; margin:0!important; padding:11px 0!important; gap:8px!important; border-radius:13px; background:${p.night ? 'rgba(255,255,255,.025)' : 'rgba(123,106,82,.025)'}; display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,96px),1fr));row-gap:8px!important; }
[data-premium-home="people-stats"] > div { width:100%!important; flex:none!important; justify-self:stretch; max-width:none!important; height:auto!important; min-height:52px!important; padding:0 6px!important; background:transparent!important; border:0!important; border-radius:0!important; box-shadow:none!important; }
[data-premium-home="people-stats"] > div + div { border-left:0!important; }
@container home-person-card (max-width:287px){[data-premium-home="people-stats"]>div:last-child:nth-child(3){grid-column:1/-1;}}
[data-premium-home="people-stats"] > div > :first-child { font-size:24px!important; line-height:28px!important; font-weight:600!important; color:var(--ink)!important; }
[data-premium-home="people-stats"] > div > :last-child { font-size:12px!important; font-weight:400!important; color:var(--muted)!important; white-space:normal!important; overflow:visible!important; }
[data-owner-home="attention"] { gap:10px; }
[data-owner-home="attention"] [data-owner-home="section-heading"] { margin-bottom:0; }
[data-owner-home="priority-detail"], [data-owner-home="focus-detail"] { position:relative; }
[data-owner-home="priority-detail"] { flex:1; min-height:136px; }
[data-owner-home="priority-detail"] > [data-premium-home="priority"] { width:100%; height:100%; grid-column:auto; margin:0!important; align-items:flex-start!important; justify-content:center!important; padding:17px 16px 17px 66px!important; border-radius:15px; box-shadow:none!important; background:var(--tone-sand)!important; border-color:var(--rim)!important; }
[data-owner-home="priority-detail"] > div > [dir="auto"] { text-align:left!important; align-self:flex-start!important; max-width:250px!important; white-space:normal!important; }
[data-owner-home="priority-detail"] > div > [dir="auto"] { color:var(--ink)!important; }
[data-owner-home="priority-detail"] > div > [dir="auto"]:nth-child(3) { color:var(--muted)!important; }
[data-owner-home="priority-detail"] > div > [dir="auto"]:first-child { color:var(--gold)!important; font-size:11px!important; font-weight:600!important; letter-spacing:1.2px!important; }
[data-owner-home="priority-detail"] > div > [dir="auto"]:nth-child(2) { font-size:17px!important; line-height:23px!important; font-weight:600!important; }
[data-owner-home="priority-detail"] > div > [dir="auto"]:nth-child(3) { font-size:13px!important; line-height:19px!important; font-weight:400!important; }
[data-owner-home="attention-icon"] { position:absolute; z-index:1; left:20px; top:24px; }
[data-owner-home="root"] [data-owner-home="attention-icon"] [dir="auto"]:first-child { font-size:27px!important; line-height:30px!important; }
[data-owner-home="availability"] > div { min-height:0; flex-direction:row!important; justify-content:flex-start!important; align-items:center!important; gap:8px; padding:2px 4px!important; margin:0; border:0!important; border-radius:0; box-shadow:none!important; background:transparent!important; }
[data-owner-home="availability"] > div::before { content:""; width:7px; height:7px; border-radius:4px; flex-shrink:0; background:var(--muted); }
[data-owner-home="availability"] > [data-availability-tone="available"]::before { background:${p.night?'#D8C29B':'#9A7743'}; }
[data-owner-home="availability"] > [data-availability-tone="limited"]::before { background:${p.night?'#D9A55E':'#C2873F'}; }
[data-owner-home="availability"] > [data-availability-tone="full"]::before { background:${p.night?'#E4B4BB':'#A9545F'}; }
[data-owner-home="availability"] [dir="auto"] { font-size:12px!important; font-weight:600!important; letter-spacing:.2px; color:var(--muted)!important; }
[data-owner-home="availability"] [data-availability-tone="available"] [dir="auto"] { color:${p.night?'#E9D9BB':'#695536'}!important; }
[data-owner-home="availability"] [data-availability-tone="limited"] [dir="auto"] { color:${p.night?'#E3BD89':'#795322'}!important; }
[data-owner-home="availability"] [data-availability-tone="full"] [dir="auto"] { color:${p.night?'#E4B4BB':'#8A444F'}!important; }

[data-owner-home="focus-detail"] [data-premium-home="focus"] { margin:0!important; padding:16px 14px 16px 66px!important; border-radius:15px; box-shadow:none!important; background:${p.night ? 'rgba(174,137,73,.13)' : 'rgba(255,236,202,.5)'}!important; border-color:${p.night ? '#D9BD8733' : '#F3DFC4'}!important; }
[data-owner-home="focus-detail"] [data-premium-home="focus"] > :first-child { color:var(--ink)!important; font-size:11px!important; font-weight:600!important; letter-spacing:1.5px; text-transform:uppercase; }
[data-owner-home="focus-detail"] [data-premium-home="focus"] > :last-child { color:var(--ink)!important; font-size:14px!important; line-height:19px!important; font-weight:500!important; }
[data-owner-home="results-row"] { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:14px; }
[data-owner-home="finance"] { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
[data-owner-home="finance"] > div { min-width:0!important; width:auto!important; flex-direction:row; align-items:center; gap:12px; min-height:88px; margin:0!important; padding:14px!important; border:1px solid var(--rim); border-radius:15px; }
[data-owner-home="finance-0"] { background:var(--tone-sand); }
[data-owner-home="finance-1"] { background:var(--tone-amber); }
[data-owner-home="results"] [data-premium-home="summary"] { border-top:1px solid var(--divider); padding-top:12px; margin-top:12px!important; }
[data-owner-home="results"] [data-premium-home="summary"] > [role="heading"] { display:none; }
[data-owner-home="results"] [data-premium-home="summary"] > div { margin:0!important; gap:6px; flex-wrap:nowrap!important; }
[data-owner-home="results"] [data-premium-home="summary"] > div > div { min-width:0!important; flex:1; flex-direction:row-reverse!important; justify-content:center; align-items:center; gap:6px; background:transparent!important; border:0!important; border-radius:0!important; box-shadow:none!important; padding:0 6px!important; min-height:56px; }
[data-owner-home="results"] [data-premium-home="summary"] > div > div + div { border-left:1px solid var(--divider)!important; }
[data-owner-home="results"] [data-premium-home="summary"] [dir="auto"] { width:auto!important; flex:0 0 auto!important; align-self:center!important; white-space:normal; font-size:12px!important; font-weight:400!important; color:var(--muted)!important; margin:0; }
[data-owner-home="results"] [data-premium-home="summary"] > div > div > :last-child { font-size:24px!important; line-height:30px!important; font-weight:600!important; color:var(--ink)!important; }
[data-owner-home="indicators"] > [data-premium-home="smart"] { background:none!important; border:0!important; box-shadow:none!important; padding:0!important; margin:0!important; }
[data-owner-home="indicators"] [data-premium-home="smart"] > :first-child { display:none; }
[data-owner-home="indicators"] [data-premium-home="smart"] > div { position:relative; padding:12px 3px 12px 42px!important; }
[data-owner-home="indicators"] [data-premium-home="smart"] [dir="auto"] { font-size:13px!important; font-weight:400!important; color:var(--ink)!important; }
[data-owner-home="indicators"] [data-premium-home="smart"] > div > :last-child { font-weight:600!important; padding-right:6px; }
[data-owner-home="indicators"] [data-premium-home="smart"] > div::before { position:absolute; left:9px; top:11px; font-family:ionicons; font-size:23px; color:var(--ink); }
[data-owner-home="indicators"] [data-premium-home="smart"] > div:nth-child(2)::before { content:"\\f29c"; }
[data-owner-home="indicators"] [data-premium-home="smart"] > div:nth-child(3)::before { content:"\\f5de"; }
[data-owner-home="indicators"] [data-premium-home="smart"] > div:nth-child(4)::before { content:"\\f59c"; }
[data-owner-home="utilities-grid"] { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; align-items:stretch; }
[data-owner-home="profile"] { position:relative; min-height:82px; border:1px solid var(--rim); border-radius:15px; background:var(--field); }
[data-owner-home="profile"] > [data-premium-home="profile"] { position:static!important; min-height:82px; height:100%; justify-content:center!important; margin:0!important; padding:0 44px 22px 66px!important; border:0!important; box-shadow:none!important; background:none!important; }
[data-owner-home="profile"] [data-home-profile-header="true"] { position:static!important; min-height:0!important; }
[data-owner-home="profile"] [data-home-profile-header="true"] > :last-child { position:absolute!important; right:13px; top:50%; transform:translateY(-50%); width:20px!important; }
[data-owner-home="profile"] [data-home-profile-header="true"] > :last-child [dir="auto"] { color:var(--muted)!important; font-size:17px!important; }
[data-owner-home="profile"] [data-premium-home="profile-preview"] { display:none; }
[data-owner-home="profile"] > [data-premium-home="profile"] > [data-home-profile-header="true"] { min-height:40px!important; padding:0!important; margin:0!important; }
[data-owner-home="profile"] > [data-premium-home="profile"] > [data-home-profile-header="true"] > :first-child > :nth-child(2) { display:none; }
[data-owner-home="profile"] > [data-premium-home="profile"] > [data-home-profile-header="true"] > :first-child > :first-child { font-family:Georgia,serif; font-size:16px!important; line-height:21px!important; font-weight:600!important; color:var(--ink)!important; }
[data-owner-home="profile-progress"] { position:absolute; pointer-events:none; left:66px; top:50%; bottom:auto; margin-top:1px; padding:0!important; font-size:12px; line-height:17px; color:${p.night ? '#9FD0B3' : '#466A50'}; }
[data-owner-home="utility-icon"] { position:absolute; z-index:1; left:14px; top:50%; transform:translateY(-50%); width:42px; height:42px; padding:0!important; align-items:center; justify-content:center; border-radius:21px; background:var(--tone-sand); }
[data-owner-home="invite-icon"] { width:42px; height:42px; flex-shrink:0; align-items:center; justify-content:center; border-radius:21px; background:var(--tone-sand); }
[data-owner-home="shop"] [data-premium-shop-icon="true"] { width:42px!important; height:42px!important; border-radius:21px!important; border:0!important; background:var(--tone-sand)!important; }
[data-owner-home="shop"] [data-premium-shop-icon="true"] [style*="font-family: ionicons" i] { color:var(--ink)!important; }
[data-owner-home="invite-toggle"] { min-height:82px; padding:13px; border:1px solid var(--rim); border-radius:15px; background:var(--field); flex-direction:row; align-items:center; gap:12px; }
[data-owner-home="invite-toggle"] > div > :first-child { font-family:Georgia,serif; font-size:16px!important; line-height:21px!important; font-weight:600!important; }
[data-owner-home="shop"], [data-owner-home="shop"] [data-premium-home="shop"] { height:100%; }
[data-owner-home="shop"] [data-premium-home="shop"] > :first-child { height:100%; margin:0!important; min-height:82px; padding:13px!important; border:1px solid var(--rim)!important; border-radius:15px; box-shadow:none!important; background:var(--field)!important; }
[data-owner-home="shop"] [data-premium-home="shop"] [dir="auto"] { font-size:12px; color:var(--muted)!important; }
[data-owner-home="shop"] [style*="font-family: ionicons" i] { color:${p.night ? '#6D8178' : p.muted}!important; }
[data-owner-home="shop"] [data-premium-home="shop"] > :first-child > :first-child > :nth-child(2) > :first-child { font-family:Georgia,serif; font-size:16px!important; line-height:21px!important; font-weight:600!important; color:var(--ink)!important; }
@media(max-width:1250px) { [data-owner-home="header"] [role="heading"] { font-size:42px!important; } [data-owner-home="section-heading"] [role="heading"] { font-size:24px!important; } [data-owner-home="main"] { grid-template-columns:minmax(0,1.4fr) minmax(240px,1fr); } [data-owner-home="stats"] { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@media(max-width:850px) { [data-owner-home="main"], [data-owner-home="results-row"] { grid-template-columns:minmax(0,1fr); } [data-owner-home="utilities-grid"] { grid-template-columns:minmax(0,1fr); } }
[data-owner-home="date"] [aria-label^="Ora attuale"] { white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important;flex-shrink:0;font-size:clamp(13px,3.5vw,14px)!important; }
@media(max-width:580px) { [data-owner-home="header"] { flex-direction:column; align-items:stretch; gap:8px; } [data-owner-home="header"] [role="heading"] { font-size:30px!important; } [data-owner-home="stats"] > div { padding:10px!important; gap:7px; } [data-owner-home="stat-icon"] { display:none; } [data-owner-home="finance"] { grid-template-columns:minmax(0,1fr); } [data-owner-home="date"]{align-self:stretch;padding:10px 12px;gap:8px;} [data-owner-home="date"] > [dir="auto"]:first-child {flex:1;min-width:0;font-size:13px!important;line-height:18px!important;word-break:normal;} [data-owner-home="stat-copy"]{align-items:center;} [data-owner-home="stat-copy"] > div{align-items:center!important;} [data-owner-home="results"] [data-premium-home="summary"] > div > div{flex-direction:column-reverse!important;gap:2px;padding:0 4px!important;} [data-owner-home="results"] [data-premium-home="summary"] [dir="auto"]{text-align:center;} }
@media(max-width:999px){[data-owner-home="header"] [role="heading"]{font-size:clamp(28px,4vw,32px)!important;line-height:1.25!important;} [data-owner-home="header"]{flex-direction:column!important;align-items:stretch!important;gap:12px;min-height:0;} [data-owner-home="header"] [data-premium-home="heading"]{width:100%;} [data-owner-home="date"]{align-self:flex-start;}}
@media(max-width:480px){[data-owner-home="section-heading"] [role="heading"]{font-size:21px!important;line-height:27px!important;} [data-owner-home="stats"] [data-owner-home="stat-copy"] [dir="auto"]{font-size:12px!important;line-height:17px!important;} }
`)}
    {s.reminder}
    <View {...mark('header')}>{s.heading}<View {...mark('date')}><Ionicons name="calendar-outline" size={18} color={p.ink} /><Text style={{ color: p.ink, fontSize: 14 }}>{dateLabel}</Text><LiveHomeClock /></View></View>
    <View {...mark('stats')}>{stat('appointments', 'calendar-outline', s.appointments)}{stat('unpaid', 'time-outline', s.unpaid)}{stat('clients', 'people-outline', s.clientTotal)}{stat('income', 'stats-chart-outline', reserveFinance?reserved:s.income)}</View>
    <View {...mark('secondary-stats')}>{secondaryMetrics.map((metric,index)=><View key={metric.label} {...mark(`secondary-${index}`)}><Ionicons name={metric.icon} size={22} color={p.ink}/><View style={{flex:1,gap:3}}><Text style={{color:p.ink,fontSize:13,lineHeight:18,fontWeight:'500'}}>{metric.label}</Text><Text style={{color:p.muted,fontSize:12,lineHeight:16}}>{metric.hint}</Text></View><Text style={{color:p.ink,fontSize:25,fontWeight:'600',fontVariant:['tabular-nums']}}>{metric.value}</Text></View>)}</View>
    <View {...mark('main')}>
      <View {...mark('operations')}>{title('La giornata', 'calendar-outline')}<View {...mark('people')}>{s.operators}{s.customers}</View></View>
      <View {...mark('attention')}>{title('Da tenere d’occhio', 'calendar-outline')}<View {...mark('priority-detail')}><View {...mark('attention-icon')} pointerEvents="none"><Ionicons name="calendar-outline" size={27} color={p.night ? '#D8C29B' : '#8F6D3B'} /></View>{s.priority}</View><View {...mark('availability')}>{s.status}</View><View {...mark('focus-detail')}><View {...mark('attention-icon')} pointerEvents="none"><Ionicons name="alert-circle-outline" size={28} color={p.night ? '#DFC79E' : '#76502B'} /></View>{s.focus}</View></View>
    </View>
    <View {...mark('results-row')}>
      {reserveFinance?<View {...mark('results')}>{title('Dati economici riservati','lock-closed-outline')}{reserved}</View>:<><View {...mark('results')}>{title('Risultati del salone', 'stats-chart-outline')}<View {...mark('finance')}>{React.Children.toArray(s.finance).map((node, index) => <View key={index} {...mark(`finance-${index}`)}><View {...mark('finance-icon')}><Ionicons name={index === 0 ? 'card-outline' : 'time-outline'} size={25} color={p.ink} /></View><View {...mark('finance-copy')}>{node}</View></View>)}</View>{s.summary}</View>
      <View {...mark('indicators')}>{title('Indicatori', 'pie-chart-outline')}{s.indicators}</View></>}
    </View>
    <View {...mark('utilities')}>{title('Il tuo salone', 'storefront-outline')}<View {...mark('utilities-grid')}>
      <View {...mark('profile')}><View {...mark('utility-icon')} pointerEvents="none"><Ionicons name="storefront-outline" size={25} color={p.ink} /></View>{s.profile}{!profileOpen ? <Text {...mark('profile-progress')}>{profileProgress}</Text> : null}</View>
      <Pressable {...mark('invite-toggle')} accessibilityRole="button" accessibilityLabel={inviteOpen ? 'Chiudi accesso clienti e QR' : 'Apri accesso clienti e QR'} accessibilityState={{ expanded: inviteOpen }} onPress={() => setInviteOpen(value => !value)}>
        <View {...mark('invite-icon')}><Ionicons name="people-outline" size={23} color={p.ink} /></View><View style={{ flex: 1 }}><Text style={{ fontSize: 15, fontWeight: '600', color: p.ink }}>Invita i tuoi clienti</Text><Text style={{ fontSize: 12, lineHeight: 17, color: p.muted, marginTop: 4 }}>Link, codice e QR · {inviteLabel}</Text></View><Ionicons name={inviteOpen ? 'chevron-up' : 'chevron-forward'} size={17} color={p.muted} />
      </Pressable>
      <View {...mark('shop')}>{s.shop}</View>
    </View>{inviteOpen ? <OwnerPremiumPopup title="Invita i tuoi clienti" icon="people-outline" kind="invite" onClose={() => setInviteOpen(false)}>{s.invite}</OwnerPremiumPopup> : null}</View>
    {s.admin}
  </View>;
}
