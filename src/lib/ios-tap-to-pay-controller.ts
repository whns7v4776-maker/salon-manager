// One iPhone reader session survives checkout navigation. Every asynchronous
// result belongs to the authenticated salon that started it.
import {waitForTapResult} from './ios-terminal-request';
export type TapState = {
  busy: boolean; recovering: boolean; ready: boolean; message: string; selected: string;
  enabled: boolean; locations: {id: string; name: string}[];
  outcome?: 'paid' | 'declined' | 'cancelled' | 'pending';
  receipt?: string;
  movementId?: string;
};
type Result = {error?: {message: string; code?: string}; [key: string]: any};
export type TapAdapter = {
  call: (action: string, extra?: Record<string, unknown>) => Promise<Result>;
  permission: (request: boolean) => Promise<boolean>;
  initialize: () => Promise<Result>;
  supported: () => Promise<Result>;
  connect: (location: string, acceptTerms: boolean) => Promise<Result>;
  disconnect: () => Promise<unknown>;
  clear: () => Promise<unknown>;
  cancel: () => Promise<unknown>;
  retrieve: (secret: string) => Promise<Result>;
  process: (intent: any) => Promise<Result>;
  education: (force: boolean, identity: string) => Promise<boolean>;
};
const initial = (): TapState => ({busy:false, recovering:false, ready:false, enabled:false, locations:[], selected:'', message:'Verifica Tap to Pay…'});
export class IosTapToPayController {
  state = initial();
  private identity = '';
  private generation = 0;
  private nativeGeneration?: number;
  private initialized = false;
  private nativeRecovery?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<() => void>();
  constructor(private adapter: TapAdapter, private setupTimeout = 180000) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private update(patch: Partial<TapState>) { this.state={...this.state,...patch}; this.listeners.forEach(listener=>listener()); }
  progress(message: string) { if(this.identity && this.nativeGeneration===this.generation)this.update({message}); }
  disconnected() { if(this.identity && this.nativeGeneration===this.generation)this.update({ready:false,message:'Tap to Pay disconnesso. Riprova la configurazione.'}); }
  setIdentity(identity: string) {
    if(this.identity===identity)return;
    this.identity=identity; this.generation++;
    this.nativeGeneration=undefined;
    this.state=initial(); this.listeners.forEach(listener=>listener());
    // Cancel the native operation immediately; cleanup is serialized before the
    // next salon can initialize or receive a connection token.
    // Terminal.shared is fatal before initialization on iOS. First login must
    // not invoke reader cleanup; an initialization already in flight is handled
    // by the serialized check below once it has finished.
    const cancelled=this.initialized?this.adapter.cancel().catch(()=>{}):Promise.resolve();
    const recovery=this.nativeRecovery;
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      await cancelled;
      await recovery;
      if(!this.initialized)return;
      await this.adapter.disconnect().catch(()=>{});
      await this.adapter.clear().catch(()=>{});
    });
  }
  assertCurrent(generation=this.generation) {
    if(!this.identity || generation!==this.generation)throw Error('Accesso al salone cambiato. Riapri Tap to Pay.');
  }
  observeMovement(movementId:string) {
    if(this.state.busy || this.state.movementId===movementId)return;
    this.update({movementId,outcome:undefined,receipt:undefined,message:this.state.ready?'Tap to Pay pronto su questo iPhone.':'Configura il telefono prima di incassare.'});
  }
  async token() {
    const generation=this.generation;
    this.assertCurrent(generation);
    if(!this.state.selected)throw Error('Seleziona la sede Stripe del salone.');
    const result=await this.adapter.call('terminal-token',{locationId:this.state.selected});
    this.assertCurrent(generation);
    return result.secret as string;
  }
  private run(job:(guard:()=>void)=>Promise<void>) {
    if(!this.identity)return Promise.reject(Error('Accedi al salone per usare Tap to Pay.'));
    if(this.state.busy)return Promise.reject(Error('Attendi la verifica o il pagamento in corso.'));
    if(this.nativeRecovery) {
      const message='La configurazione del telefono si sta interrompendo. Se non termina, chiudi e riapri SalonPro.';
      this.update({recovering:true,message});
      return Promise.reject(Error(message));
    }
    const generation=this.generation;
    const guard=()=>this.assertCurrent(generation);
    // Reserve synchronously, including the short interval before queued native
    // cleanup finishes. A second tap cannot enqueue another payment operation.
    this.update({busy:true});
    const previous=this.queue.catch(()=>{});
    const result=(async()=>{
      try {
        await waitForTapResult(previous,this.setupTimeout,'L’interruzione della configurazione non risponde. Chiudi e riapri SalonPro.',()=>{
          this.nativeGeneration=undefined;
          if(generation===this.generation)this.update({ready:false,recovering:true});
          if(!this.nativeRecovery) {
            const recovery=previous.then(()=>{
              if(this.nativeRecovery!==recovery)return;
              this.nativeRecovery=undefined;
              if(this.identity)this.update({recovering:false,...(generation===this.generation?{message:'Configurazione interrotta. Puoi riprovare.'}:{})});
            });
            this.nativeRecovery=recovery;
          }
        });
        guard(); await job(guard);
      }
      catch(error) {
        if(generation===this.generation)this.update({message:error instanceof Error?error.message:'Tap to Pay non disponibile. Riprova.'});
        throw error;
      } finally { if(generation===this.generation)this.update({busy:false}); }
    })();
    this.queue=result.catch(()=>{});
    return result;
  }
  private async setupStep<T>(pending:Promise<T>, guard:()=>void, timeout=this.setupTimeout) {
    const generation=this.generation;
    let timedOut=false;
    try {
      const value=await waitForTapResult(pending,timeout,'La configurazione del telefono non risponde. Chiudi e riapri SalonPro se l’interruzione non termina.',()=>{timedOut=true;});
      guard(); return value;
    } finally {
      if(timedOut) {
        this.nativeGeneration=undefined;
        if(generation===this.generation)this.update({ready:false,recovering:true});
        // Keep a native fence until the late operation AND its cleanup finish.
        // A timeout never authorizes a second reader operation or payment.
        // Initialization may still be pending: Terminal.shared is unsafe then.
        const cancelled=this.initialized?this.adapter.cancel().catch(()=>{}):Promise.resolve();
        const recovery=Promise.all([pending.catch(()=>{}),cancelled]).then(async()=>{
          if(this.initialized) {
            await this.adapter.disconnect().catch(()=>{});
            await this.adapter.clear().catch(()=>{});
          }
        }).then(()=>{
          if(this.nativeRecovery!==recovery)return;
          this.nativeRecovery=undefined;
          if(this.identity)this.update({recovering:false,...(generation===this.generation?{message:'Configurazione interrotta. Puoi riprovare ad attivare Tap to Pay.'}:{})});
        });
        this.nativeRecovery=recovery;
      }
    }
  }
  private async prepare(acceptTerms:boolean, guard:()=>void) {
    guard();
    if(this.state.ready)return true;
    this.update({message:'Verifica salone e sede Stripe…'});
    const status=await this.adapter.call('terminal-status'); guard();
    const locations=status.locations??[];
    const selected=locations.some((l:{id:string})=>l.id===this.state.selected)?this.state.selected:locations[0]?.id??'';
    this.update({enabled:status.enabled===true,locations,selected});
    if(!status.enabled || !selected) {
      this.update({message:status.reason??'Configura una sede italiana in Stripe → Terminal → Sedi.'}); return false;
    }
    if(!(await this.setupStep(this.adapter.permission(acceptTerms),guard,Math.min(this.setupTimeout,90000)))) {
      guard(); this.update({message:'Autorizza la posizione per configurare Tap to Pay. QR e link restano disponibili.'}); return false;
    }
    guard(); this.update({message:'Preparazione Tap to Pay su iPhone…'});
    this.nativeGeneration=this.generation;
    const initialized=await this.setupStep(this.adapter.initialize().then(result=>{
      // Late success still enables cleanup for the previous merchant, even
      // after account changes or the setup deadline has expired.
      if(!result.error)this.initialized=true;
      return result;
    }),guard,Math.min(this.setupTimeout,30000));
    guard();
    if(initialized.error)throw Error(initialized.error.message);
    const support=await this.setupStep(this.adapter.supported(),guard,Math.min(this.setupTimeout,15000)); guard();
    if(support.error || !support.readerSupportResult) {
      this.update({message:'Tap to Pay non disponibile su questo iPhone. Verifica iOS e compatibilità; puoi usare QR o link.'}); return false;
    }
    // With false, Apple/Stripe either confirms existing merchant acceptance or
    // rejects the connection. A stored local flag never substitutes for it.
    const connected=await this.setupStep(this.adapter.connect(selected,acceptTerms),guard); guard();
    if(connected.error) {
      this.update({ready:false,message:acceptTerms?connected.error.message:'Attiva Tap to Pay per completare la configurazione del telefono.'}); return false;
    }
    this.update({ready:true,message:'Tap to Pay pronto su questo iPhone.'});
    return true;
  }
  warmup() {
    if(!this.identity || this.state.busy)return Promise.resolve();
    return this.run(async guard=>{await this.prepare(false,guard);});
  }
  activate() {
    return this.run(async guard=>{
      if(await this.prepare(true,guard)) {
        const shown=await this.setupStep(this.adapter.education(false,this.identity),guard); guard();
        this.update({message:shown?'Tap to Pay pronto. Scegli un servizio da incassare.':'Telefono configurato. La guida è sempre disponibile qui.'});
      }
    });
  }
  guide() {
    return this.run(async guard=>{
      // Official Apple education follows confirmed terms. The app's help sheet
      // can always be read without authentication requests or reader setup.
      if(!this.state.ready)return;
      await this.setupStep(this.adapter.education(true,this.identity),guard);guard();
    });
  }
  select(location: string) {
    return this.run(async guard=>{
      if(!this.state.locations.some(l=>l.id===location))throw Error('Sede non valida.');
      if(this.initialized) {
        await this.adapter.disconnect(); guard(); await this.adapter.clear(); guard();
      }
      this.update({selected:location,ready:false,message:'Sede selezionata. Configura Tap to Pay.'});
    });
  }
  async check(movementId:string,guard=()=>this.assertCurrent()) {
    guard();const result=await this.adapter.call('terminal-check',{movementId});guard();
    const outcome=result.status==='paid'?'paid':result.status==='expired'?'cancelled':result.outcome==='declined'?'declined':'pending';
    this.update({movementId,outcome,receipt:result.receipt,
      message:outcome==='paid'?'Pagamento approvato. Incasso confermato in Cassa e Agenda.':outcome==='declined'?'Pagamento rifiutato. Nessun incasso registrato. Puoi cambiare metodo dopo aver annullato il tentativo.':outcome==='cancelled'?'Tentativo annullato. Puoi scegliere un altro metodo.':'Esito in verifica. Non effettuare un secondo incasso.'});
    return outcome==='paid';
  }
  verify(movementId:string,onPaid:()=>void) { return this.run(async guard=>{if(await this.check(movementId,guard))onPaid();}); }
  pay(movementId:string,onPaid:()=>void) {
    return this.run(async guard=>{
      if(!(await this.prepare(true,guard)))return;
      const shown=await this.setupStep(this.adapter.education(false,this.identity),guard);guard();
      if(!shown){this.update({message:'Guida chiusa. Nessun pagamento avviato.'});return;}
      this.update({outcome:undefined,receipt:undefined,message:'Preparazione dell’importo…'});
      const reserved=await this.adapter.call('terminal-intent',{movementId});guard();
      if(reserved.status==='paid'){await this.check(movementId,guard);onPaid();return;}
      if(!reserved.clientSecret){await this.check(movementId,guard);return;}
      const retrieved=await this.adapter.retrieve(reserved.clientSecret);guard();
      if(retrieved.error || !retrieved.paymentIntent)throw Error(retrieved.error?.message??'Impossibile preparare il pagamento. Verifica prima di riprovare.');
      this.update({message:'Avvicina la carta o il wallet alla parte superiore dell’iPhone.'});
      await this.adapter.process(retrieved.paymentIntent).catch(()=>({}));guard();
      // SDK errors/timeouts never establish failure; verify the same server intent.
      if(await this.check(movementId,guard))onPaid();
    });
  }
  cancelRead() { return this.initialized?this.adapter.cancel():Promise.resolve(); }
  cancelAttempt(movementId:string,onPaid:()=>void) {
    return this.run(async guard=>{
      await this.adapter.call('terminal-cancel',{movementId});guard();
      if(await this.check(movementId,guard))onPaid();
    });
  }
}
