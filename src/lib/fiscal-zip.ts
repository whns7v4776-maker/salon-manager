import {zipSync,strToU8} from 'fflate';
import {FiscalReceipt} from './fiscal-archive';
export const fiscalYear=(r:FiscalReceipt)=>new Date(r.created_at).toLocaleDateString('en-CA',{year:'numeric',timeZone:'Europe/Rome'});
export async function createFiscalZip(rows:FiscalReceipt[],getPdf:(r:FiscalReceipt,isVoid:boolean)=>Promise<Uint8Array>,progress:(done:number,total:number)=>void=()=>{}) {
 const docs=rows.flatMap(r=>r.status==='ready'?[{r,isVoid:false},...(r.void_status==='ready'?[{r,isVoid:true}]:[])]:[]);
 if(!docs.length)throw Error('Non ci sono PDF pronti nel periodo selezionato.');
 const files:Record<string,Uint8Array>={},missing:string[]=[];let size=0,done=0;
 for(const {r,isVoid} of docs){
  const path=`${fiscalYear(r)}/${isVoid?'Annullamenti':'Ricevute'}/${isVoid?'annullamento':'ricevuta'}-${r.id}.pdf`;
  try {const bytes=await getPdf(r,isVoid);if(String.fromCharCode(...bytes.slice(0,5))!=='%PDF-')throw Error('PDF non valido');size+=bytes.length;
   if(size>100*1024*1024)throw Error('ARCHIVE_SIZE');files[path]=bytes;
  }catch(e){if(e instanceof Error&&e.message==='ARCHIVE_SIZE')throw Error('L’archivio supera 100 MB. Scarica un anno alla volta per non sovraccaricare il dispositivo.');missing.push(path);}
  progress(++done,docs.length);
 }
 if(!Object.keys(files).length)throw Error('Nessun PDF disponibile. Aggiorna il collegamento e riprova.');
 files['LEGGIMI.txt']=strToU8(`SALONPRO · ARCHIVIO DI COLLAUDO\nDocumenti simulati senza validità fiscale.\nPDF inclusi: ${docs.length-missing.length} su ${docs.length}.\nOriginali e annullamenti sono separati per anno.\n${missing.length?'ATTENZIONE: archivio incompleto. Consulta PDF-NON-DISPONIBILI.txt.':'Tutti i PDF pronti del periodo selezionato sono inclusi.'}`);
 if(missing.length)files['PDF-NON-DISPONIBILI.txt']=strToU8('PDF non recuperati, da verificare e scaricare nuovamente:\n'+missing.join('\n'));
 return {bytes:zipSync(files,{level:0}),missing:missing.length,count:docs.length-missing.length};
}
