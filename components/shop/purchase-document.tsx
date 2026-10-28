import React, { useState } from "react";
import { Platform, Text, View } from "react-native";
import {
  purchaseDocumentHtml,
  type PurchaseOrder,
} from "../../src/lib/shop-purchasing";
import { shopUI as s } from "../../src/lib/shop-pickup";
import { ShopButton } from "./shop-pickup-ui";
export function PurchaseDocument({
  order,
  salonName,
}: {
  order: PurchaseOrder;
  salonName: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const exportDocument = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    const view = Platform.OS === "web" ? window.open("", "_blank") : null;
    if (view) view.opener = null;
    try {
      const html = purchaseDocumentHtml(order, salonName);
      if (Platform.OS === "web") {
        if (!view) throw new Error("Consenti la finestra di stampa e riprova.");
        view.document.open();
        view.document.write(
          html.replace(
            "<main>",
            '<main><p class="actions"><button onclick="window.print()" style="padding:14px;border:0;border-radius:12px;background:#285b78;color:white">Stampa / Salva PDF</button></p>',
          ),
        );
        view.document.close();
      } else {
        const Print = await import("expo-print");
        const Sharing = await import("expo-sharing");
        const pdf = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(pdf.uri, {
            mimeType: "application/pdf",
            UTI: "com.adobe.pdf",
            dialogTitle: "Ordine al fornitore",
          });
        else await Print.printAsync({ uri: pdf.uri });
      }
    } catch (e) {
      view?.close();
      setError(e instanceof Error ? e.message : "Documento non disponibile");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <ShopButton
        title={
          busy
            ? "Preparazione…"
            : Platform.OS === "web"
              ? "Stampa / Salva ordine PDF"
              : "Salva / Condividi ordine PDF"
        }
        disabled={busy}
        onPress={() => void exportDocument()}
      />
      {!!error && <Text style={s.error}>{error}</Text>}
    </View>
  );
}
