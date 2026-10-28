import React, { useRef, useState } from "react";
import { Platform, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { HapticTouchable } from "./ui/haptic-touchable";
import { packageMoney } from "../src/lib/service-packages";
import type { GiftCard } from "../src/lib/customer-benefits";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function GiftCardDocument({ gift }: { gift: GiftCard }) {
  const qr = useRef<{ toDataURL: (cb: (data: string) => void) => void } | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const exportCard = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const printWindow =
      Platform.OS === "web" ? window.open("", "_blank") : null;
    if (printWindow) printWindow.opener = null;
    try {
      if (Platform.OS === "web" && !printWindow)
        throw new Error(
          "Consenti l’apertura della finestra del buono e riprova.",
        );
      if (!qr.current) throw new Error("Il codice è in preparazione. Riprova.");
      const png = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Codice non disponibile. Riprova.")),
          5000,
        );
        qr.current!.toDataURL((data) => {
          clearTimeout(timer);
          resolve(data);
        });
      });
      const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;color:#203647;padding:40px}main{border:2px solid #c4ddce;border-radius:24px;padding:32px;max-width:550px;margin:auto;text-align:center}h1{font-size:32px}.value{font-size:28px}img{width:170px;height:170px}p{line-height:1.5}</style></head><body><main><p>SalonPro · Buono regalo nominativo</p><h1>Un regalo per te</h1><p><strong>${escape(gift.salon_name || "Il tuo salone")}</strong><br>Per ${escape(gift.customer_name || "il cliente intestatario")}</p><p class="value">Valore iniziale ${escape(packageMoney(gift.amount_cents))}</p><p>${escape(gift.message || "")}</p><p>${gift.sender_name ? `Da parte di ${escape(gift.sender_name)}` : ""}</p><img src="data:image/png;base64,${png}" alt="Codice buono"><p><strong>${escape(gift.code)}</strong></p><p>${gift.expires_on ? `Valido fino al ${escape(gift.expires_on.split("-").reverse().join("/"))}` : "Senza scadenza"}</p><p>Presentalo al salone che lo ha emesso. Il salone verifica intestatario, validità e saldo aggiornato prima di ogni utilizzo. Stampare o scansionare questo buono non consuma il credito.</p><small>Buono regalo, non documento fiscale.</small></main></body></html>`;
      if (Platform.OS === "web" && printWindow) {
        printWindow.document.open();
        printWindow.document.write(
          html.replace(
            "<body>",
            '<body><div style="text-align:center;margin-bottom:20px" class="print-actions"><button onclick="window.print()" style="padding:14px 22px;border:0;border-radius:12px;background:#203647;color:white;font-size:16px">Stampa / Salva PDF</button></div><style>@media print{.print-actions{display:none}}</style>',
          ),
        );
        printWindow.document.close();
      } else {
        const Print = await import("expo-print");
        const result = await Print.printToFileAsync({ html });
        const Sharing = await import("expo-sharing");
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(result.uri, {
            mimeType: "application/pdf",
            UTI: "com.adobe.pdf",
            dialogTitle: "Salva o condividi gift card",
          });
        else await Print.printAsync({ uri: result.uri });
      }
    } catch (e) {
      printWindow?.close();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10, alignItems: "flex-start" }}>
      <QRCode
        value={`salonpro-gift:${gift.code}`}
        size={112}
        getRef={(ref) => {
          qr.current = ref;
        }}
      />
      <HapticTouchable
        disabled={busy}
        accessibilityRole="button"
        onPress={() => void exportCard()}
        style={{ padding: 12, borderRadius: 12, backgroundColor: "#F5EBF0" }}
      >
        <Text style={{ fontWeight: "700", color: "#963B57" }}>
          {busy
            ? "Preparazione…"
            : Platform.OS === "web"
              ? "Stampa / Salva PDF"
              : "Scarica / Condividi buono"}
        </Text>
      </HapticTouchable>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: "#B42318" }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
