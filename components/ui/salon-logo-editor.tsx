import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from '../owner-native-premium';
import { useSettingsWebStyles } from '../settings-web-styles';
import { popupGlass } from '../premium-web-surfaces';
import { OwnerPremiumNameDesigner } from '../owner-premium-name-designer';
import { useAccessAppearance } from '../access-premium';
import { DockedSheetSurface } from './docked-sheet-surface';
import { HorizontalCardScrollView } from './horizontal-card-scroll-view';

import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { plaqueRequest, plaqueUrl, setSalonPlaqueCache, useSalonPlaque, type PlaqueFinish, type PlaqueStatus, type SalonPlaque } from '../../src/lib/salon-logo-plaque';
import { invalidateSalonBrandPlacement } from '../../src/lib/salon-brand-placements';
import { LogoPlaquePreview } from './salon-logo-plaque';
import { HapticTouchable } from './haptic-touchable';
import { salonNameFontOptions } from '../../src/lib/fonts';

type Source={uri:string;width:number;height:number;base64:string};
// The same 4:1 frame on iOS, Android and web; native picker crop ratios differ.
function LogoCropper({source,workspaceId,onDone,onCancel}: {source:Source;workspaceId:string;onDone:(base64:string)=>void;onCancel:()=>void}) {
  const styles=useSettingsWebStyles(baseLogoStyles);
  const [width,setWidth]=useState(280),[zoom,setZoom]=useState(1),[offset,setOffset]=useState({x:0,y:0});
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  // Minimum zoom contains the entire image. A cover baseline prevents zooming
  // out far enough for logos whose aspect ratio differs from the crop frame.
  const height=width/4, scale=Math.min(width/source.width,height/source.height)*zoom;
  const bounds={x:Math.max(0,(source.width*scale-width)/2),y:Math.max(0,(source.height*scale-height)/2)};
  const current=useRef({offset,bounds}); current.current={offset,bounds};
  const start=useRef(offset);
  const pan=useRef(PanResponder.create({onStartShouldSetPanResponder:()=>true,
    onMoveShouldSetPanResponder:()=>true,onPanResponderGrant:()=>{start.current=current.current.offset;},
    onPanResponderMove:(_,g)=>{const b=current.current.bounds;setOffset({
      x:Math.max(-b.x,Math.min(b.x,start.current.x+g.dx)),y:Math.max(-b.y,Math.min(b.y,start.current.y+g.dy))});},
  })).current;
  const prepare=async(crop:boolean)=>{
    if(busy)return;setBusy(true);setError('');
    try {
      const cropWidth=Math.min(source.width,Math.floor(width/scale));
      const cropHeight=Math.min(source.height,Math.floor(height/scale));
      const region=crop?{
        x:Math.min(source.width-cropWidth,Math.max(0,Math.round((source.width*scale-width)/2/scale-offset.x/scale)))/source.width,
        y:Math.min(source.height-cropHeight,Math.max(0,Math.round((source.height*scale-height)/2/scale-offset.y/scale)))/source.height,
        width:cropWidth/source.width,height:cropHeight/source.height,
      }:null;
      const result=await plaqueRequest<{base64:string}>(workspaceId,'prepare',{image:source.base64,crop:region});
      if(!result.base64||result.base64.length>4_000_000) throw new Error('Foto troppo grande. Scegli un ritaglio più piccolo.');
      onDone(result.base64);
    } catch(e) {setError(e instanceof Error?e.message:'Impossibile preparare il logo.');} finally {setBusy(false);}
  };
  return <View style={styles.stack}>
    <Text style={styles.title}>Inquadra il logo</Text>
    <Text style={styles.caption}>Sposta la foto nel riquadro. Non tagliare lettere o simboli.</Text>
    <View onLayout={e=>setWidth(e.nativeEvent.layout.width)} style={[styles.crop,{height}]} {...pan.panHandlers}>
      <Image source={{uri:source.uri}} style={{position:'absolute',width:source.width*scale,height:source.height*scale,
        left:(width-source.width*scale)/2+offset.x,top:(height-source.height*scale)/2+offset.y}}/>
    </View>
    <View style={styles.row}>{[-1,1].map(direction=><HapticTouchable key={direction} disabled={busy} style={styles.smallButton}
      accessibilityLabel={direction<0?'Riduci zoom':'Aumenta zoom'} onPress={()=>{setZoom(z=>Math.max(1,Math.min(4,z+direction*.25)));setOffset({x:0,y:0});}}>
      <Ionicons name={direction<0?'remove':'add'} size={20}/></HapticTouchable>)}
      <Text style={styles.caption}>Formato orizzontale 4:1</Text></View>
    {!!error&&<Text style={styles.error}>{error}</Text>}
    <HapticTouchable disabled={busy} accessibilityRole="button" {...(Platform.OS === 'web' ? { dataSet: { logoPart: 'primary' } } : {})} style={styles.primary} onPress={()=>void prepare(true)}><Text style={styles.primaryText}>{busy?'Preparazione…':'Usa questo ritaglio'}</Text></HapticTouchable>
    <HapticTouchable disabled={busy} style={styles.secondary} onPress={()=>void prepare(false)}><Text style={styles.buttonText}>Logo verticale? Usa la foto intera</Text></HapticTouchable>
    <Text style={styles.caption}>Il formato finale è orizzontale: il logo e il suo fondo restano interi, senza deformazioni. Potrai controllare il risultato prima di pubblicarlo.</Text>
    <HapticTouchable disabled={busy} onPress={onCancel}><Text style={styles.link}>Annulla ritaglio</Text></HapticTouchable>
  </View>;
}

export function SalonLogoEditor({workspaceId,name,disabled}: {workspaceId:string;name:string;disabled:boolean}) {
  const styles=useSettingsWebStyles(baseLogoStyles);
  const { palette: p } = useAccessAppearance();
  const approved=useSalonPlaque(workspaceId),insets=useSafeAreaInsets();
  const [open,setOpen]=useState(false),[source,setSource]=useState<Source|null>(null),[image,setImage]=useState<string|null>(null);
  const [status,setStatus]=useState<PlaqueStatus|null>(null),[finish,setFinish]=useState<PlaqueFinish>('metal');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [observedJobId,setObservedJobId]=useState<string|null>(null);
  const [mode,setMode]=useState<'text'|'logo'>('text'),[font,setFont]=useState('manrope');
  const [pollError,setPollError]=useState('');
  const [logoStep,setLogoStep]=useState<1|2|3>(1);
  const mounted=useRef(true),lock=useRef(false);
  const pendingGeneration=useRef<string|null>(null);
  const resumeDraft=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setOpen(false);setSource(null);setImage(null);setStatus(null);},[workspaceId]);
  useEffect(()=>{
    if(!open||source)return;let alive=true;let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const next=await plaqueRequest<PlaqueStatus>(workspaceId,'status');
        if(!alive)return;setStatus(next);setPollError('');
        if(next.state==='generating'&&next.jobId){setObservedJobId(next.jobId);pendingGeneration.current=next.jobId;}
        if(next.state==='ready'&&next.previewUrl&&(next.jobId===pendingGeneration.current||resumeDraft.current)){setImage(null);setLogoStep(3);pendingGeneration.current=null;resumeDraft.current=false;}
        if(next.state==='generating')timer=setTimeout(poll,3000);
      } catch{if(alive){setPollError('Aggiornamento dello stato non disponibile. Riprovo automaticamente.');timer=setTimeout(poll,8000);}}
    };
    void poll();return()=>{alive=false;clearTimeout(timer);};
  },[open,workspaceId,notice,source]);
  const run=async(work:()=>Promise<void>)=>{
    if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');
    try{await work();}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Operazione non riuscita.');}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  };
  const choose=()=>run(async()=>{
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,quality:.6,base64:true});
    if(!result.canceled){const asset=result.assets[0];
      if(!asset.width||!asset.height||!asset.base64)throw new Error('Non riesco a leggere questa immagine. Scegli un’altra foto.');
      if(asset.base64.length>10_000_000)throw new Error('Foto troppo grande. Prova con uno screenshot del logo.');
      pendingGeneration.current=null;resumeDraft.current=false;
      setSource({uri:asset.uri,width:asset.width,height:asset.height,base64:asset.base64});setImage(null);setObservedJobId(null);setNotice('');}
  });
  const openEditor=()=>{resumeDraft.current=true;setLogoStep(1);setMode(approved?.path?'logo':'text');setFont(approved?.font??'manrope');setFinish(approved?.finish??'metal');setObservedJobId(null);setError('');setOpen(true);};
  const generating=status?.state==='generating';
  const preview=image?`data:image/png;base64,${image}`:status?.previewUrl;
  const actionFeedback=<>
    {!!error&&<Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    {mode==='logo'&&!!status?.error&&!!observedJobId&&status.jobId===observedJobId&&<Text style={styles.error} accessibilityRole="alert">{status.error}</Text>}
    {mode==='logo'&&generating&&!!pollError&&<Text style={styles.error} accessibilityRole="alert">{pollError}</Text>}
  </>;
  return <View {...(Platform.OS==='web'?{dataSet:{salonLogoCard:'true'}}:{})} style={[styles.card,Platform.OS==='web'&&{padding:16,borderRadius:16,borderWidth:1,borderColor:p.border,minWidth:0,...popupGlass(p,'panel')}]} >
    {Platform.OS==='web'?<View {...{dataSet:{logoCardHeading:'true'}}} style={{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',gap:12,minWidth:0,paddingBottom:6}}>
      <View style={{flexGrow:1,flexShrink:1,flexBasis:170,minWidth:0,gap:5}}><Text style={[styles.title,{lineHeight:25}]}>Logo e targhetta</Text><Text style={styles.caption}>La firma del tuo salone, in orizzontale.</Text></View>
      <HapticTouchable disabled={disabled} accessibilityRole="button" accessibilityLabel="Modifica logo e targhetta" accessibilityState={{disabled:!!disabled}} style={[styles.editHint,{alignSelf:'flex-start',minHeight:44,flexShrink:0,paddingHorizontal:12,paddingVertical:10},disabled&&{opacity:0.5}]} onPress={openEditor}><Ionicons name="create-outline" size={17} color={p.ink}/><Text style={styles.editHintText}>Modifica</Text><Ionicons name="chevron-forward" size={16} color={p.ink}/></HapticTouchable>
    </View>:(
    <HapticTouchable disabled={disabled} accessibilityRole="button" accessibilityLabel="Modifica logo e targhetta" accessibilityState={{disabled:!!disabled}} style={[styles.row, disabled && {opacity:0.5}]} onPress={openEditor}>
      <View style={{flex:1}}><Text style={styles.title}>Logo e targhetta</Text><Text style={styles.caption}>La firma del tuo salone, in orizzontale.</Text></View>
      <View style={styles.editHint}><Ionicons name="create-outline" size={16} color={'#375472'}/><Text style={styles.editHintText}>Modifica</Text><Ionicons name="chevron-forward" size={16} color={'#375472'}/></View>
    </HapticTouchable>
    )}
    <LogoPlaquePreview uri={approved?.path?plaqueUrl(approved.path):undefined} source={approved?.source} font={approved?.font} finish={approved?.finish} name={name}/>
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={open} transparent animationType="fade" onRequestClose={()=>{if(!busy)setOpen(false);}}>
      <View {...(Platform.OS === 'web' ? { dataSet: { premiumLogoPopup: 'true' } } : {})} style={[styles.backdrop,{paddingTop:insets.top+16,paddingBottom:0},Platform.OS==='web'&&{justifyContent:'center',paddingBottom:24}]}>
      {Platform.OS === 'web' ? React.createElement('style', null, `
[data-premium-logo-popup] { background:${p.night ? 'rgba(0,0,0,.5)' : 'rgba(40,35,29,.28)'}!important; backdrop-filter:blur(8px); }
[data-premium-logo-popup] > div { background:${popupGlass(p).backgroundColor}!important; backdrop-filter:blur(24px) saturate(110%); border:1px solid ${p.border}; box-shadow:0 -12px 80px #0003; max-width:560px!important; }
[data-premium-logo-popup] [dir="auto"] { color:${p.ink}!important; }
[data-premium-logo-popup] [aria-label="Chiudi logo e targhetta"], [data-premium-logo-popup] [role="button"], [data-premium-logo-popup] [role="tab"] { background:${p.field}!important; border:1px solid ${p.border}!important; box-shadow:none!important; border-radius:11px!important; }
[data-premium-logo-popup] [data-logo-selected="true"], [data-premium-logo-popup] [aria-checked="true"] { background:${p.action}!important; }
[data-premium-logo-popup] [data-logo-selected="true"] [dir="auto"], [data-premium-logo-popup] [aria-checked="true"] [dir="auto"] { color:${p.actionText}!important; }
[data-premium-logo-popup] [data-logo-part="fonts"] { background:transparent!important; scrollbar-width:thin; scrollbar-color:${p.night ? '#ffffff38 #ffffff08' : '#b8aea0 #e8e3dc'}; }
[data-premium-logo-popup] [data-logo-part="fonts"] > div, [data-premium-logo-popup] [data-logo-part="finishes"] { background:transparent!important; border:0!important; margin:0!important; padding:4px 0 8px!important; gap:10px!important; }
[data-premium-logo-popup] [data-logo-selected] { background:${p.field}!important; border:1px solid ${p.border}!important; border-radius:11px!important; min-height:42px; padding:10px 14px!important; box-shadow:none!important; }
[data-premium-logo-popup] [data-logo-selected="true"] { background:${p.action}!important; border-color:${p.action}!important; }
[data-premium-logo-popup] [data-logo-selected="true"] [dir="auto"] { color:${p.actionText}!important; }
[data-premium-logo-popup] :focus-visible { outline:2px solid ${p.night ? '#DDC496' : '#9D845A'}!important; outline-offset:3px; }
[data-premium-logo-popup] > div > div:first-child { border-color:${p.line}!important; }
[data-premium-logo-popup] > div > div:first-child > [dir="auto"] { font-family:Georgia,serif; font-size:25px; font-weight:500; }
[data-premium-logo-popup] [data-logo-part="modes"], [data-premium-logo-popup] [data-logo-part="preview"] { background:${p.field}!important; border:1px solid ${p.border}; border-radius:14px!important; margin:0!important; padding:12px!important; }
[data-premium-logo-popup] [data-logo-part="primary"] { background:${p.action}!important; border:0!important; }
[data-premium-logo-popup] [data-logo-part="primary"] [dir="auto"] { color:${p.actionText}!important; }
`) : null}
        <DockedSheetSurface {...(Platform.OS !== 'web' ? {onClose: ()=>{if(!busy)setOpen(false);}, dismissDisabled:busy} : {})} style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}><Text style={[styles.title,{flex:1}]}>Logo e targhetta</Text>
            <HapticTouchable disabled={busy} style={[styles.smallButton, Platform.OS === 'web' && {flexDirection:'row',gap:8,paddingHorizontal:12,minHeight:40,borderRadius:11}]} accessibilityRole="button" accessibilityLabel="Chiudi logo e targhetta" onPress={()=>setOpen(false)}>{Platform.OS === 'web' ? <Text style={{fontSize:12,color:p.ink}}>Chiudi</Text> : null}<Ionicons name={Platform.OS === 'web' ? 'close-outline' : 'close'} size={Platform.OS === 'web' ? 19 : 24} color={Platform.OS === 'web' ? p.ink : '#475569'}/></HapticTouchable></View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {source?<LogoCropper source={source} workspaceId={workspaceId} onCancel={()=>setSource(null)} onDone={b64=>{setImage(b64);setSource(null);setLogoStep(2);}}/>:<>
              <View {...(Platform.OS === 'web' ? { dataSet: { logoPart: 'modes' } } : {})} style={styles.row}>{(['text','logo'] as const).map(value=><HapticTouchable key={value} disabled={busy} accessibilityRole="tab" {...(Platform.OS === 'web' ? { dataSet: { logoSelected: String(mode===value) } } : {})} accessibilityState={{selected:mode===value}} style={[styles.finish,mode===value&&styles.modeSelected,{backgroundColor:mode===value?p.action:p.field,borderColor:mode===value?p.action:p.border}]} onPress={()=>{setMode(value);setError('');}}><Text style={[styles.buttonText,mode===value&&styles.modeSelectedText,{color:mode===value?p.actionText:p.ink}]}>{value==='text'?'Nome salone':'Logo · IA'}</Text></HapticTouchable>)}</View>
              <Text style={styles.caption}>{mode==='text'?'Scegli font e finitura. Nessuna IA.':'Un percorso guidato: immagine, preparazione, targhetta.'}</Text>
              {mode==='logo'&&<View style={{flexDirection:'row',gap:8}}>{['Immagine','Preparazione','Targhetta'].map((label,index)=><View key={label} style={{flex:1,gap:6}}><View style={{height:3,borderRadius:2,backgroundColor:index+1<=logoStep?p.action:p.line}}/><Text style={{fontSize:11,color:index+1===logoStep?p.ink:p.muted}}>{index+1} · {label}</Text></View>)}</View>}
              {Platform.OS === 'web' && mode === 'text' ? <OwnerPremiumNameDesigner name={name} font={font} finish={finish} disabled={busy} onFont={setFont} onFinish={setFinish}/> : <View {...(Platform.OS === 'web' ? { dataSet: { logoPart: 'preview' } } : {})} style={styles.previewArea}><Text style={styles.eyebrow}>Prenota da</Text>
                <LogoPlaquePreview uri={mode==='text'?undefined:preview??(approved?.path?plaqueUrl(approved.path):undefined)} source={image?'upload':status?.previewUrl?'ai':approved?.source} horizontal={mode==='logo'&&logoStep===3} font={font} finish={mode==='logo'&&logoStep!==3?'none':finish} name={name}/>
                <Text style={styles.previewCaption}>{mode==='text'?'Anteprima del nome':image?'Logo caricato · non ancora salvato':status?.previewUrl?'Anteprima · non ancora pubblicata':'Targhetta attuale'}</Text></View>}
              {mode==='text'&&Platform.OS!=='web'&&<HorizontalCardScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{salonNameFontOptions.map(option=><HapticTouchable key={option.key} disabled={busy} style={[styles.secondary,font===option.key&&styles.selected]} onPress={()=>setFont(option.key)} accessibilityState={{selected:font===option.key}}><Text style={[styles.buttonText,{fontFamily:option.family}]}>{option.label}</Text></HapticTouchable>)}</HorizontalCardScrollView>}
              {mode==='text'&&Platform.OS!=='web'&&<><Text style={styles.buttonText}>Stile targhetta</Text>
              <View style={styles.row}>{(['none','satin','glass','metal'] as const).map((value,index)=><HapticTouchable key={value}
                disabled={busy} accessibilityRole="button" accessibilityLabel={['Senza badge','Satinata','Vetro','Metallo'][index]} accessibilityState={{selected:finish===value}} style={[styles.finish,finish===value&&styles.selected]}
                onPress={()=>setFinish(value)}>{value==='none'?<View accessible={false} style={styles.transparencyIcon}>
                  {Array.from({length:9},(_,i)=><View key={i} style={{width:6,height:6,backgroundColor:i%2===0?'#64748B':'transparent'}}/>)}
                </View>:<Text style={styles.buttonText}>{['','Satinata','Vetro','Metallo'][index]}</Text>}</HapticTouchable>)}</View></>}
              {mode==='logo'&&<>{generating?<View style={styles.progress}>{!pollError&&<ActivityIndicator color={p.ink}/>}<Text style={styles.caption}>{pollError?'Verifica temporaneamente sospesa.':'Verifico l’immagine e preparo la targhetta. Adatto i loghi quadrati a un’insegna larga, conservando il materiale del fondo. Pulisco le fotografie solo se serve.'}</Text>
                {actionFeedback}
                <Text style={styles.previewCaption}>Salva sarà disponibile quando l’anteprima è pronta. Annullando, il risultato verrà scartato; il tentativo resta conteggiato.</Text>
                <HapticTouchable disabled={busy} style={[styles.secondary,{backgroundColor:'#FEE2E2'}]} onPress={()=>void run(async()=>{
                  await plaqueRequest(workspaceId,'cancel',{jobId:status?.jobId});setStatus({state:'idle',finish});setPollError('');setNotice(`generation-${Date.now()}`);
                })}><Text style={[styles.buttonText,{color:'#B42335'}]}>Annulla creazione</Text></HapticTouchable>
              </View>:<>
                {logoStep===1&&<><Text style={styles.title}>1. Scegli la tua immagine</Text><Text style={styles.caption}>Puoi caricare un logo già pronto oppure la foto della tua insegna. Includi tutto il marchio e il suo fondo.</Text>                <HapticTouchable disabled={busy} accessibilityRole="button" accessibilityLabel="Scegli foto o screenshot" accessibilityState={{disabled:busy}} pressOpacity={0.82} style={[styles.uploadButton,busy&&{opacity:0.5}]} onPress={()=>void choose()}>
                  <Ionicons name="images-outline" size={22} color={Platform.OS==='web'?p.ink:'#244C86'}/>
                  <Text style={[styles.buttonText,{color:Platform.OS==='web'?p.ink:'#244C86',flexShrink:1}]}>Scegli foto o screenshot</Text>
                  <Ionicons name="add-circle-outline" size={20} color={Platform.OS==='web'?p.ink:'#244C86'}/>
                </HapticTouchable>
{(approved?.path||status?.previewUrl)&&<HapticTouchable disabled={busy} accessibilityRole="button" style={styles.secondary} onPress={()=>{setImage(null);if(approved?.path)setStatus(current=>current?{...current,previewUrl:undefined}:current);setLogoStep(3);}}><Text style={styles.buttonText}>{approved?.path?'Personalizza la targhetta attuale':'Riprendi l’anteprima pronta'}</Text></HapticTouchable>}</>}
                {logoStep===2&&image&&<Text style={styles.title}>2. Prepara la targhetta</Text>}
                {logoStep===2&&image&&<><Text style={styles.caption}>L’IA adatta un’icona quadrata a una vera insegna orizzontale, estendendo il suo fondo e mantenendo il marchio leggibile. Un logo già largo resta intatto; una fotografia viene ripulita solo nelle parti estranee all’insegna.</Text>
                  <Text style={styles.caption}>Con “Prepara targhetta” invii l’immagine a OpenAI per la verifica ed eventualmente la pulizia. Carica solo un logo che hai diritto di usare. {status?.unlimited?'Prove illimitate per il tuo account.':'Massimo 3 preparazioni al giorno.'}</Text>
                  <Text style={styles.previewCaption}>Crea l’anteprima, poi controllala e salva.</Text>
                  {actionFeedback}
                  <HapticTouchable disabled={busy} accessibilityRole="button" {...(Platform.OS === 'web' ? { dataSet: { logoPart: 'primary' } } : {})} style={styles.primary} onPress={()=>void run(async()=>{
                    setObservedJobId(null);
                    try {
                      const next=await plaqueRequest<PlaqueStatus>(workspaceId,'generate',{image});pendingGeneration.current=next.jobId??null;setStatus(next);setObservedJobId(next.jobId??null);
                    } finally {
                      // If the response was lost, recover the server job instead of submitting another paid edit.
                      setNotice(`generation-${Date.now()}`);
                    }
                  })}>{busy&&<ActivityIndicator color="#FFFFFF" style={styles.buttonSpinner}/>}<Text style={styles.primaryText}>{busy?'Preparazione…':'Prepara targhetta'}</Text></HapticTouchable>
                  <HapticTouchable disabled={busy} accessibilityRole="button" style={styles.secondary} onPress={()=>{setLogoStep(3);setError('');}}><Text style={styles.buttonText}>Continua con l’originale, senza IA</Text></HapticTouchable></>}
                {logoStep===3&&<><Text style={styles.title}>3. Scegli la finitura e salva</Text><Text style={styles.caption}>{image?'Il logo originale resta integro, compreso il suo sfondo.':status?.processing==='adapted'?'Ho adattato l’icona in un’insegna orizzontale. Controlla che il fondo e il marchio siano corretti.':status?.processing==='preserved'?'Il logo era già pronto: ho conservato anche il suo sfondo e l’ho adattato al formato.':status?.processing==='restored'?'Ho ripulito la fotografia mantenendo l’insegna. Controlla parole, simboli e fondo.':status?.processing==='uncertain'?'Per prudenza ho conservato l’immagine originale. Se contiene parti estranee, prova una foto più chiara.':'Controlla parole, simboli e sfondo prima di pubblicare.'}</Text>
                  <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['none','satin','glass','metal'] as const).map((value,index)=><HapticTouchable key={value} disabled={busy} accessibilityRole="button" accessibilityLabel={`Finitura ${['Solo logo','Satinata','Vetro','Metallo'][index]}`} accessibilityState={{selected:finish===value}} {...(Platform.OS==='web'?{dataSet:{logoSelected:String(finish===value)}}:{})} onPress={()=>setFinish(value)} style={{flexBasis:'46%',flexGrow:1,minHeight:44,padding:12,borderRadius:12,borderWidth:1,borderColor:finish===value?p.action:p.border,backgroundColor:finish===value?p.action:p.field}}><Text style={{textAlign:'center',color:finish===value?p.actionText:p.ink,fontSize:13}}>{['Solo logo','Satinata','Vetro','Metallo'][index]}{finish===value?' ✓':''}</Text></HapticTouchable>)}</View>
                </>}
                {logoStep>1&&<HapticTouchable disabled={busy} accessibilityRole="button" onPress={()=>{setLogoStep(1);setImage(null);setError('');}} style={styles.secondary}><Text style={styles.buttonText}>Scegli un’altra immagine</Text></HapticTouchable>}
              </>}
              </>}
              {(mode==='text'||(!generating&&logoStep!==2))&&actionFeedback}
              {(mode==='text'||(!generating&&logoStep===3))&&<HapticTouchable accessibilityRole="button" disabled={busy||(mode==='logo'&&(!image&&!status?.previewUrl&&!approved?.path))} {...(Platform.OS === 'web' ? { dataSet: { logoPart: 'primary' } } : {})} style={styles.primary} onPress={()=>void run(async()=>{
                const result=await plaqueRequest<SalonPlaque>(workspaceId,mode==='text'?'saveText':image?'saveOriginal':status?.previewUrl?'approve':'saveLogoFinish',mode==='text'?{font,finish}:image?{image,finish}:{jobId:status?.jobId,finish});
                setSalonPlaqueCache(workspaceId,result);invalidateSalonBrandPlacement(workspaceId);setNotice('Targhetta salvata e visibile ai clienti.');setOpen(false);
              })}>{busy&&<ActivityIndicator color="#FFFFFF" style={styles.buttonSpinner}/>}<Text style={styles.primaryText}>{busy?'Salvataggio…':'Salva targhetta'}</Text></HapticTouchable>}
            </>}
          </ScrollView>
        </DockedSheetSurface>
      </View>
    </Modal>
    {!!notice&&!notice.startsWith('generation-')&&<Text style={styles.caption}>{notice}</Text>}
  </View>;
}
const baseLogoStyles=StyleSheet.create({
  card:{padding:16,gap:14,borderRadius:20,borderWidth:1,borderColor:'#DDE5ED',backgroundColor:'#F8FAFC'},
  row:{flexDirection:'row',alignItems:'center',gap:12,marginHorizontal:-16,marginTop:-16,padding:16,borderTopLeftRadius:20,borderTopRightRadius:20,backgroundColor:'#EDF3FA',borderBottomWidth:1,borderBottomColor:'#DDE5ED'},
  editHint:{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,paddingVertical:9,borderRadius:12,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#D3DFED'},
  editHintText:{fontSize:12,fontWeight:'700',color:'#375472'},
  title:{fontSize:18,fontWeight:'800',color:'#111827'},
  caption:{fontSize:13,lineHeight:19,color:'#64748B'},fallback:{fontSize:25,lineHeight:32,color:'#18365B',textAlign:'center',fontWeight:'600'},
  backdrop:{flex:1,backgroundColor:'rgba(15,23,42,0.4)',paddingHorizontal:16,justifyContent:'flex-end', paddingBottom: 0 },
  sheet:{width:'100%',maxWidth:480,maxHeight:'100%',alignSelf:'center',borderRadius:26,backgroundColor:'#FFFFFF',overflow:'hidden',flexShrink:1},
  header:{flexDirection:'row',alignItems:'center',padding:18,borderBottomWidth:1,borderColor:'#EEF1F5',gap:12},
  content:{padding:18,gap:16},stack:{gap:14},smallButton:{minWidth:44,minHeight:44,borderRadius:14,backgroundColor:'#F1F5F9',alignItems:'center',justifyContent:'center'},
  primary:{backgroundColor:'#142239',borderRadius:16,padding:15,minHeight:52,justifyContent:'center',alignItems:'center'},primaryText:{fontSize:15,fontWeight:'700',color:'#FFFFFF',textAlign:'center'},
  buttonSpinner:{position:'absolute',left:16},
  secondary:{backgroundColor:'#F1F5F9',borderRadius:16,padding:14,alignItems:'center'},buttonText:{fontSize:13,fontWeight:'700',color:'#334155',textAlign:'center'},
  uploadButton:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:10,minHeight:52,paddingHorizontal:16,paddingVertical:14,
    borderRadius:16,backgroundColor:'#EAF2FF',borderWidth:1.5,borderColor:'#ADC8EF',borderTopColor:'#D5E5FA',
    shadowColor:'#244C86',shadowOpacity:0.12,shadowRadius:3,shadowOffset:{width:0,height:2},elevation:2},
  finish:{flex:1,paddingVertical:12,borderRadius:14,borderWidth:1,borderColor:'#DFE5EC',backgroundColor:'#F8FAFC'},selected:{backgroundColor:'#E8F0FF',borderColor:'#4F7AC6'},
  modeSelected:{backgroundColor:'#142239',borderColor:'#142239'},modeSelectedText:{color:'#FFFFFF'},
  transparencyIcon:{width:20,height:20,alignSelf:'center',flexDirection:'row',flexWrap:'wrap',borderWidth:1,borderColor:'#64748B',borderRadius:3,overflow:'hidden'},
  previewArea:{gap:10,paddingVertical:18,paddingHorizontal:6,borderRadius:20,backgroundColor:'#FAFBFC'},
  eyebrow:{textAlign:'center',fontSize:17,fontWeight:'600',color:'#52667D'},previewCaption:{fontSize:11,color:'#64748B',textAlign:'center'},
  crop:{width:'100%',overflow:'hidden',backgroundColor:'#E2E8F0',borderRadius:12},
  progress:{gap:12,padding:16,borderRadius:16,backgroundColor:'#EDF4FA'},error:{color:'#B42335',fontSize:13,lineHeight:19},link:{color:'#365980',textAlign:'center',padding:10},
});
