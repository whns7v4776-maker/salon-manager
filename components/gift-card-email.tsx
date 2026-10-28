import { benefitsDesign as d } from "./benefits-design";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { supabase } from "../src/lib/supabase";
import { HapticTouchable } from "./ui/haptic-touchable";
export function GiftCardEmail({ giftId }: { giftId: string }) {
  const [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <View style={{ gap: 8 }}>
      {confirm ? (
        <Text>
          Inviare il buono all’email salvata nella scheda di questo cliente?
        </Text>
      ) : null}
      <HapticTouchable
        disabled={busy}
        onPress={async () => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          if (busy) return;
          setBusy(true);
          setNotice("");
          try {
            const { data, error } = await supabase.functions.invoke(
              "send-gift-card",
              { body: { giftId } },
            );
            if (error) {
              let message =
                "Invio non riuscito. Controlla email cliente e riprova.";
              try {
                const body = await error.context?.json();
                if (body?.error) message = body.error;
              } catch {}
              throw new Error(message);
            }
            if (data?.error) throw new Error(data.error);
            setNotice(
              `Email affidata al servizio di invio: ${data.recipient}. Il recapito non è ancora confermato.`,
            );
            setConfirm(false);
          } catch (e) {
            setNotice((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
        style={confirm ? d.primary : d.secondary}
      >
        <Text style={confirm ? d.primaryText : d.secondaryText}>
          {busy
            ? "Invio…"
            : confirm
              ? "Conferma invio email"
              : "Invia buono via email"}
        </Text>
      </HapticTouchable>
      {confirm ? <HapticTouchable accessibilityRole="button" disabled={busy} style={d.secondary} onPress={()=>setConfirm(false)}><Text style={d.secondaryText}>Annulla invio</Text></HapticTouchable> : null}
      {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
    </View>
  );
}
