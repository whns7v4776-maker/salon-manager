import { NativeReadableText as Text } from './owner-native-premium';
import { useCustomerPremiumColor, useCustomerPremiumStyles } from './owner-premium-customers-style';
import { benefitsDesign as baseBenefitsDesign } from "./benefits-design";
import React, { useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { supabase } from "../src/lib/supabase";
import { HapticTouchable } from "./ui/haptic-touchable";
export function GiftCardLookup({
  onFound,
}: {
  onFound: (c: { id: string; full_name: string }) => void;
}) {
 const premiumColor=useCustomerPremiumColor();

 const benefitsUi=useCustomerPremiumStyles(baseBenefitsDesign);

  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [scanning, setScanning] = useState(false),
    [busy, setBusy] = useState(false);
  const [permission, request] = useCameraPermissions();
  const lock = useRef(false);
  const find = async (value: string) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setScanning(false);
    setError("");
    try {
      const r = await supabase.rpc("find_salon_gift_card", { p_code: value });
      if (r.error) throw new Error(r.error.message);
      onFound(r.data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8, paddingVertical: 10 }}>
      <Text style={{ fontWeight: "700", color:premiumColor("#26384A") }}>Trova gift card</Text>
      <TextInput
        accessibilityLabel="Codice gift card"
        placeholder="Codice univoco"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        style={[benefitsUi.input, { padding: 12, backgroundColor: premiumColor("#FFF","backgroundColor"), borderRadius: 12 }]}
      />
      <HapticTouchable
        accessibilityRole="button"
        style={[benefitsUi.secondary,{opacity:(busy||!code.trim())?0.5:1}]}
        disabled={busy || !code.trim()}
        onPress={() => void find(code)}
      >
        <Text style={{color:premiumColor("#26384A")}}>Cerca codice</Text>
      </HapticTouchable>
      {Platform.OS !== "web" ? (
        <HapticTouchable
          disabled={busy}
          onPress={async () => {
            const p = permission?.granted ? permission : await request();
            if (p.granted) setScanning((v) => !v);
            else
              setError(
                "Per leggere il QR abilita la fotocamera, oppure inserisci il codice.",
              );
          }}
        >
          <Text style={{color:premiumColor("#26384A")}}>
            {scanning ? "Chiudi fotocamera" : "Scansiona QR del buono"}
          </Text>
        </HapticTouchable>
      ) : null}
      {scanning ? (
        <CameraView
          style={{ height: 240, borderRadius: 16 }}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={(result) => {
            if (result.data.startsWith("salonpro-gift:"))
              void find(result.data);
          }}
        />
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: premiumColor("#B42318","color") }}>
          {error}
        </Text>
      ) : null}
      <Text style={{color:premiumColor("#26384A")}}>
        La ricerca non consuma credito. Apri l’appuntamento in agenda per
        applicare il buono.
      </Text>
    </View>
  );
}
