type SalonQrPrintHtmlInput = {
  qrImageBase64: string;
  salonCode: string;
  salonName: string;
  wordmarkUri: string;
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const buildSalonQrPrintHtml = ({
  qrImageBase64,
  salonCode,
  salonName,
  wordmarkUri,
}: SalonQrPrintHtmlInput) => {
  const salonLabel = escapeHtml(salonName.trim() || salonCode.trim() || 'Salon Pro');
  const codeLabel = escapeHtml(salonCode);
  const logoUri = escapeHtml(wordmarkUri);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <style>
          @page { margin: 18mm; }
          html, body { width: 100%; margin: 0; padding: 0; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; }
          .page { box-sizing: border-box; width: 100%; max-width: 170mm; margin: 0 auto; padding: 0; text-align: center; }
          .eyebrow { color: #64748b; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; }
          .brand-logo-crop { width: 72mm; height: 38mm; overflow: hidden; position: relative; margin: 2mm auto 0; }
          .brand-logo { position: absolute; width: 72mm; height: auto; left: 0; top: -5mm; }
          .booking { color: #475569; font-size: 17px; font-weight: 700; margin: 0 0 14px; }
          .booking strong { color: #0f172a; }
          .qr { display: block; width: 72mm; height: 72mm; margin: 0 auto 22px; }
          .code { font-size: 16px; font-weight: 800; margin-bottom: 8px; }
          .cta { margin: 18px auto 0; padding-top: 14px; border-top: 1px solid #cbd5e1; max-width: 132mm; }
          .cta-title { color: #0f172a; font-size: 15px; font-weight: 800; margin: 0 0 5px; }
          .cta-copy { color: #475569; font-size: 12px; line-height: 18px; margin: 0; }
          .stores { color: #0f172a; font-size: 12px; font-weight: 800; margin: 8px 0 0; }
        </style>
      </head>
      <body>
        <main class="page">
          <div class="eyebrow">QR code salone</div>
          <div class="brand-logo-crop"><img class="brand-logo" src="${logoUri}" /></div>
          <p class="booking">Prenota da <strong>${salonLabel}</strong></p>
          <img class="qr" src="data:image/png;base64,${qrImageBase64}" />
          ${salonCode ? `<div class="code">Codice salone: ${codeLabel}</div>` : ''}
          <section class="cta">
            <p class="cta-title">Sei già cliente di questo salone?</p>
            <p class="cta-copy">Scarica SalonPro su App Store o Google Play, crea il tuo account e prenota in autonomia.</p>
            <p class="stores">&#63743; App Store &nbsp; &bull; &nbsp; &#x1F916; Google Play</p>
          </section>
        </main>
      </body>
    </html>
  `;
};
