import React,{useState} from 'react';
import {Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {HapticTouchable} from './ui/haptic-touchable';
import {useAccessAppearance} from './access-premium';

const helpContent={
 saved:{title:'Percorsi salvati',paragraphs:[
  'Sono scorciatoie per recuperare le singole fasi di un percorso già salvato, senza sceglierle una per una. Premi «Usa percorso», poi personalizza ordine, durata, prezzo e posa nel passaggio Percorso. Il percorso originale non viene modificato.',
  'Il badge indica se il percorso può essere usato online oppure solo in salone. Se contiene una posa tra le fasi, o un servizio non compatibile online, puoi usarlo con destinazione «Solo salone».',
  'Esempio: recuperi Taglio e Piega da un percorso esistente e ne personalizzi le durate. «Usa percorso» non salva automaticamente la nuova composizione.',
 ]},
 private:{title:'Fasi private',paragraphs:[
  'Sono prestazioni riservate alle composizioni: non compaiono come servizi singoli nel listino prenotabile dai clienti. Puoi crearle con nome, mestiere, durata e prezzo oppure ricavarle da un servizio esistente.',
  '«Privata» non significa necessariamente «Solo salone»: una fase privata può far parte di una composizione online se è disponibile online e non ha un tempo di posa. Controlla il badge accanto alla fase.',
  'Esempio: una fase tecnica di 15 minuti da includere in un percorso colore, senza venderla separatamente. «Crea fase privata» salva la fase nel salone; «Salva composizione» salva il percorso completo.',
 ]},
 rules:{title:'Regole della composizione',paragraphs:[
  'Scegli da 2 a 20 servizi dello stesso mestiere. Puoi combinare servizi del listino e fasi private. I badge indicano subito se ogni voce è compatibile online oppure utilizzabile solo in salone.',
  'Compatibile online: il servizio è disponibile online e non ha un tempo di posa. La composizione online non può contenere pose aggiunte tra le fasi. I servizi selezionati rimangono soggetti alla conferma del salone.',
  'Solo salone: puoi usare anche servizi non disponibili online o con posa e aggiungere pose tra le fasi. Il percorso si usa nell’Agenda del salone e non è prenotabile online.',
  'Se hai scelto «Anche online», le voci «Solo salone» restano visibili con il motivo ma non sono selezionabili. Per usarle torna a Dati e scegli «Solo salone». Vale anche per i percorsi salvati e per le sostituzioni.',
  'Le fasi private non si vendono singolarmente, ma possono essere compatibili online dentro un percorso. Un servizio online con servizi collegati o una fase finale non compare direttamente tra i componenti: usa le singole prestazioni o una fase privata adatta.',
 ]},
};
export function CompositionHelp({topic,compact=false}:{topic:keyof typeof helpContent;compact?:boolean}){
 const {palette:p}=useAccessAppearance();const [open,setOpen]=useState(false);const {title,paragraphs}=helpContent[topic];
 return <View style={{width:'100%',gap:open?12:0,marginTop:compact?10:16}}>
  <HapticTouchable accessibilityRole="button" accessibilityLabel={`Informazioni ${title.toLowerCase()}`} accessibilityState={{expanded:open}} onPress={()=>setOpen(value=>!value)} style={{minHeight:44,paddingHorizontal:12,paddingVertical:11,flexDirection:'row',alignItems:'center',gap:10,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}><Ionicons name="information-circle-outline" size={17} color={p.muted}/><Text style={{flex:1,fontSize:12,lineHeight:18,fontWeight:'500',color:p.ink}}>{title}</Text><Ionicons name={open?'chevron-up':'chevron-down'} size={15} color={p.muted}/></HapticTouchable>
  {open?<View style={{padding:14,gap:12,borderRadius:12,borderWidth:1,borderColor:p.line,backgroundColor:p.surface}}>{paragraphs.map((text,index)=><Text key={index} style={{fontSize:13,lineHeight:21,color:index===0?p.ink:p.muted}}>{text}</Text>)}</View>:null}
 </View>;
}
