import {HapticTouchable as Pressable} from './ui/haptic-touchable';
import {useAppContext} from '../src/context/AppContext';
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAccessAppearance } from "./access-premium";
import { useCashDevicePrivacy } from "../src/lib/cash-device-privacy";
import { verifyCashOwnerPassword } from "../src/lib/cash-owner-verification";
import { cashPasskeyStatus, verifyCashPasskey } from "../src/lib/cash-passkey";
import { CashWebDialog } from "./cash-web-dialog";
export type CashAccessControls = {
  enabled: boolean;
  onConfigure: () => void;
  onLock: () => void;
};
export function CashDeviceGate({
  scope,
  email,
  active,
  settingsOnly = false,
  onSettingsClose,
  children,
}: {
  scope: string;
  email: string;
  active: boolean;
  settingsOnly?: boolean;
  onSettingsClose?: () => void;
  children: (access: CashAccessControls) => React.ReactNode;
}) {
  const {requestOwnerPasswordReset}=useAppContext();
  const [recoveryOpen,setRecoveryOpen]=useState(false),[recoveryMessage,setRecoveryMessage]=useState('');
  const sendRecovery=async()=>{
    if(busyRef.current)return;
    busyRef.current=true;setBusy(true);setRecoveryMessage('');
    try{const result=await requestOwnerPasswordReset(email);setRecoveryMessage(result.ok?'Link di recupero inviato. Controlla l’email dell’account SalonPro.':result.error||'Invio non riuscito. Riprova.');}
    catch{setRecoveryMessage('Connessione non disponibile. Riprova.');}
    finally{busyRef.current=false;setBusy(false);}
  };
  const { palette: p } = useAccessAppearance();
  const { enabled, setEnabled } = useCashDevicePrivacy(scope);
  const [unlockedScope, setUnlockedScope] = useState<string | null>(null);
  const unlocked = unlockedScope === scope;
  const setUnlocked = useCallback(
    (value: boolean) => setUnlockedScope(value ? scope : null),
    [scope],
  );
  const [intent, setIntent] = useState<"unlock" | "settings" | "enroll" | null>(
    settingsOnly ? "settings" : null,
  );
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [biometric, setBiometric] = useState({
    supported: false,
    ready: false,
    registered: false,
  });
  const busyRef = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setUnlocked(false);
    setIntent(settingsOnly ? "settings" : null);
    setPassword("");
    setError("");
    setBiometric({ supported: false, ready: false, registered: false });
    let cancelled = false;
    void cashPasskeyStatus().then((status) => {
      if (!cancelled) setBiometric(status);
    });
    const invalidate = () => {
      generation.current++;
    };
    return () => {
      cancelled = true;
      invalidate();
    };
  }, [scope, setUnlocked, settingsOnly]);
  useEffect(() => {
    if (!active) {
      generation.current++;
      setIntent(null);
      setPassword("");
    }
  }, [active]);
  const close = () => {
    if (busyRef.current) return;
    setIntent(null);
    setPassword("");
    setError("");
    if (settingsOnly) onSettingsClose?.();
  };
  const verify = async (biometricOnly = false, requestedIntent = intent) => {
    if (busyRef.current || (!biometricOnly && !password)) return;
    const version = generation.current;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (requestedIntent === "enroll") {
        await verifyCashPasskey(true, password);
        if (generation.current !== version) return;
        setBiometric(await cashPasskeyStatus());
        setIntent("settings");
      } else {
        if (biometricOnly) await verifyCashPasskey();
        else await verifyCashOwnerPassword(password, email);
        if (generation.current !== version) return;
        if (requestedIntent === "settings") setEnabled(!enabled);
        setUnlocked(true);
        setIntent(null);
        if (settingsOnly) onSettingsClose?.();
      }
    } catch (e) {
      if (generation.current === version)
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Sblocco annullato o non disponibile. Puoi usare la password."
            : e instanceof Error
              ? e.message
              : "Verifica non riuscita.",
        );
    } finally {
      setPassword("");
      setBusy(false);
      busyRef.current = false;
    }
  };
  const button = (
    label: string,
    onPress: () => void,
    disabled = false,
    primary = true,
  ) => (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={{
        paddingVertical: 13,
        paddingHorizontal: 20,
        borderRadius: 11,
        backgroundColor: primary ? p.action : p.field,
        borderWidth: 1,
        borderColor: p.border,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text
        style={{
          color: primary ? p.actionText : p.ink,
          fontSize: 14,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
  const locked = enabled === null || (enabled && !unlocked);
  return (
    <>
      {settingsOnly ? null : locked ? (
        <View
          {...{ dataSet: { cashLocked: "true" } }}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            gap: 18,
          }}
        >
          <Ionicons name="lock-closed-outline" size={36} color={p.ink} />
          <Text style={{ fontFamily: "Georgia", fontSize: 32, color: p.ink }}>
            Cassa riservata
          </Text>
          <Text
            style={{
              color: p.muted,
              fontSize: 15,
              lineHeight: 23,
              textAlign: "center",
              maxWidth: 440,
            }}
          >
            {enabled === null
              ? "Caricamento delle impostazioni del dispositivo…"
              : "Gli importi e i movimenti sono riservati al titolare. Sblocca con la password dell’account o con una passkey registrata."}
          </Text>
          {enabled !== null ? (
            <>
              {button("Sblocca con password", () => setIntent("unlock"))}
              {button(
                "Face ID / impronta",
                () => {
                  setIntent("unlock");
                  void verify(true, "unlock");
                },
                !biometric.ready || !biometric.registered,
                false,
              )}
            </>
          ) : null}
        </View>
      ) : (
        children({
          enabled: !!enabled,
          onConfigure: () => setIntent("settings"),
          onLock: () => {
            generation.current++;
            setUnlocked(false);
            setIntent(null);
            setPassword("");
            setError("");
          },
        })
      )}
      {intent ? (
        <CashWebDialog
          title={
            intent === "unlock"
              ? "Sblocca Cassa"
              : intent === "enroll"
                ? "Registra Face ID / impronta"
                : "Protezione della Cassa"
          }
          onClose={close}
          busy={busy}
          footer={
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {biometric.ready && biometric.registered && intent !== "enroll"
                ? button(
                    "Usa Face ID / impronta",
                    () => {
                      void verify(true);
                    },
                    busy,
                    false,
                  )
                : null}
              {button(
                busy
                  ? "Verifica…"
                  : intent === "unlock"
                    ? "Sblocca"
                    : intent === "enroll"
                      ? "Registra passkey"
                      : enabled
                        ? "Disattiva protezione"
                        : "Attiva protezione",
                () => {
                  void verify();
                },
                busy || !password,
              )}
            </View>
          }
        >
          <Text style={{ color: p.ink, fontSize: 16, fontWeight: "500" }}>
            {intent === "unlock"
              ? "Verifica del titolare"
              : intent === "enroll"
                ? "Conferma prima la password del titolare"
                : enabled
                  ? "Protezione attiva su questo dispositivo"
                  : "Protezione facoltativa · disattivata"}
          </Text>
          <Text style={{ color: p.muted, fontSize: 14, lineHeight: 22 }}>
            {intent === "unlock"
              ? "La password resta sempre disponibile. Face ID e impronta usano una passkey verificata dal server."
              : intent === "enroll"
                ? "Il browser ti chiederà di confermare con lo sblocco del dispositivo. Registra la passkey soltanto su un dispositivo o profilo personale del titolare."
                : "Puoi lasciare la Cassa libera oppure richiedere lo sblocco del titolare. Dopo lo sblocco rimane aperta mentre lavori, anche se cambi sezione o finestra. Premi Blocca Cassa quando vuoi riservarla di nuovo. Il refresh e il cambio account richiedono un nuovo sblocco; i riepiloghi economici della Home restano riservati."}
          </Text>
          <Text style={{ color: p.muted, fontSize: 13, lineHeight: 21 }}>
            Impostazione di questo browser e di questo salone. Per
            autorizzazioni distinte sul server occorrono account separati per i
            dipendenti.
          </Text>
          <TextInput
            accessibilityLabel="Password del titolare"
            secureTextEntry
            editable={!busy}
            value={password}
            onChangeText={setPassword}
            placeholder="Password del titolare"
            placeholderTextColor={p.muted}
            autoComplete="current-password"
            onSubmitEditing={() => {
              void verify();
            }}
            style={{
              minHeight: 50,
              borderWidth: 1,
              borderColor: p.border,
              borderRadius: 12,
              padding: 14,
              color: p.ink,
              backgroundColor: p.night ? "#2B2B29" : "#EAE4DA",
            }}
          />
          <Pressable accessibilityRole="button" disabled={busy} onPress={()=>setRecoveryOpen(v=>!v)} style={{alignSelf:'flex-start',paddingHorizontal:8,paddingVertical:10,minHeight:40}}><Text style={{fontSize:13,color:p.muted}}>Password dell’account dimenticata?</Text></Pressable>{recoveryOpen?<View style={{gap:12,padding:14,borderWidth:1,borderColor:p.border,borderRadius:12,backgroundColor:p.field}}><Text style={{fontSize:13,lineHeight:20,color:p.muted}}>Invia il link per recuperare la password dell’account SalonPro a {email}. Cambierà anche la password di accesso al salone.</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void sendRecovery()} style={{padding:12,minHeight:44,borderRadius:10,backgroundColor:p.action,alignItems:'center'}}><Text style={{fontSize:13,color:p.actionText}}>{busy?'Invio in corso…':'Conferma invio link'}</Text></Pressable>{recoveryMessage?<Text accessibilityRole="alert" style={{fontSize:13,lineHeight:20,color:p.ink}}>{recoveryMessage}</Text>:null}</View>:null}
          {intent === "settings" ? (
            <View
              style={{
                gap: 10,
                paddingTop: 16,
                borderTopWidth: 1,
                borderColor: p.line,
              }}
            >
              <Text style={{ fontSize: 16, color: p.ink }}>
                Face ID / impronta
              </Text>
              <Text style={{ color: p.muted, fontSize: 13, lineHeight: 21 }}>
                {!biometric.supported
                  ? "Il browser o dispositivo attuale non offre lo sblocco biometrico tramite passkey."
                  : !biometric.ready
                    ? "La verifica passkey va attivata sul server prima di poter registrare Face ID o impronta."
                    : biometric.registered
                      ? "Passkey registrata. Il dispositivo decide se usare Face ID, impronta o codice di sblocco."
                      : "Prima attiva la protezione con la password, poi registra la tua passkey."}
              </Text>
              {button(
                "Registra Face ID / impronta",
                () => {
                  setPassword("");
                  setError("");
                  setIntent("enroll");
                },
                !enabled || !biometric.ready || busy,
                false,
              )}
            </View>
          ) : null}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={{ fontSize: 14, color: p.night ? "#E5AAB5" : "#944559" }}
            >
              {error}
            </Text>
          ) : null}
        </CashWebDialog>
      ) : null}
    </>
  );
}
