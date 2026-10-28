import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import XLSX from "npm:xlsx-js-style@1.2.0";
import { reportData, sections, type Snapshot } from "./report.ts";
export const base64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const printable = (x: unknown) =>
  String(x ?? "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF€]/g, " ");
export async function reportFiles(
  s: Snapshot,
  logo: Uint8Array,
  only?: { section: (typeof sections)[number]; extension: "pdf" | "xlsx" },
) {
  const data = reportData(s),
    files: { filename: string; content: string }[] = [];
  for (const section of sections.filter(
    (section) => !only || section === only.section,
  )) {
    const rows = data.rows[section],
      metrics = data.metrics[section];
    if (!only || only.extension === "xlsx") {
      const wb = XLSX.utils.book_new(),
        ws = XLSX.utils.aoa_to_sheet([
          [`SalonPro · ${section}`, s.salon, s.month],
          ...metrics,
          [],
          ...rows,
          [],
          [data.notes],
        ]);
      ws["!cols"] = rows[0].map(() => ({ wch: 28 }));
      ws["!autofilter"] = {
        ref: `A6:${XLSX.utils.encode_col(rows[0].length - 1)}${rows.length + 5}`,
      };
      Object.keys(ws)
        .filter((k) => !k.startsWith("!"))
        .forEach((k) => {
          const c = ws[k],
            r = XLSX.utils.decode_cell(k).r;
          c.s = {
            font: {
              name: "Calibri",
              sz: 11,
              color: { rgb: r === 0 || r === 5 ? "FFFFFF" : "20364D" },
              bold: r === 0 || r === 5,
            },
            fill: {
              fgColor: {
                rgb:
                  r === 0 || r === 5 ? "20364D" : r % 2 ? "F3F7FB" : "FFFFFF",
              },
            },
            alignment: { wrapText: true, vertical: "center" },
          };
          if (
            c.t === "n" &&
            r >= 5 &&
            rows[0][XLSX.utils.decode_cell(k).c]?.includes("EUR")
          )
            c.z = '#,##0.00 "€"';
        });
      XLSX.utils.book_append_sheet(wb, ws, section);
      files.push({
        filename: `SalonPro-${s.month.slice(0, 7)}-${section}.xlsx`,
        content: XLSX.write(wb, { type: "base64", bookType: "xlsx" }),
      });
    }
    if (only?.extension === "xlsx") continue;
    const pdf = await PDFDocument.create(),
      font = await pdf.embedFont(StandardFonts.Helvetica),
      bold = await pdf.embedFont(StandardFonts.HelveticaBold),
      img = await pdf.embedPng(logo);
    let page: any,
      y = 0;
    const addPage = () => {
      page = pdf.addPage([842, 595]);
      page.drawImage(img, {
        x: 36,
        y: 538,
        width: 100,
        height: (100 * img.height) / img.width,
      });
      page.drawText(printable(`${section} · ${s.month.slice(0, 7)}`), {
        x: 155,
        y: 550,
        size: 16,
        font: bold,
        color: rgb(0.12, 0.21, 0.3),
      });
      page.drawText(printable(s.salon).slice(0, 120), {
        x: 155,
        y: 530,
        size: 10,
        font,
        color: rgb(0.35, 0.42, 0.5),
      });
      y = 400;
      metrics.forEach((metric, i) => {
        const x = 36 + i * 260;
        page.drawRectangle({
          x,
          y: 440,
          width: 250,
          height: 62,
          color: rgb(0.93, 0.97, 0.95),
        });
        page.drawText(printable(metric[0]), {
          x: x + 12,
          y: 482,
          size: 10,
          font,
          color: rgb(0.35, 0.42, 0.5),
        });
        page.drawText(
          printable(
            typeof metric[1] === "number"
              ? metric[1].toLocaleString("it-IT", {
                  minimumFractionDigits:
                    String(metric[0]).includes("Movimenti") ||
                    String(metric[0]).includes("registrate") ||
                    section === "Magazzino"
                      ? 0
                      : 2,
                })
              : metric[1],
          ),
          {
            x: x + 12,
            y: 456,
            size: 20,
            font: bold,
            color: rgb(0.12, 0.21, 0.3),
          },
        );
      });
    };
    const draw = (text: unknown, x: number, size = 9, isBold = false) =>
      page.drawText(printable(text), {
        x,
        y,
        size,
        font: isBold ? bold : font,
        color: rgb(0.12, 0.21, 0.3),
      });
    addPage();
    const width = 770 / rows[0].length;
    function wrap(value: unknown, max: number) {
      const display =
        typeof value === "number" && String(rows[0][0]) !== ""
          ? value
          : String(value ?? "");
      const chars = [...printable(display)];
      const lines: string[] = [];
      let line = "";
      for (const c of chars) {
        if (font.widthOfTextAtSize(line + c, 9) > max) {
          lines.push(line);
          line = "";
        }
        line += c;
      }
      lines.push(line);
      return lines;
    }
    for (let r = 0; r < rows.length; r++) {
      const lines = rows[r].map((v, i) =>
        wrap(
          typeof v === "number" && rows[0][i]?.includes("EUR")
            ? v.toLocaleString("it-IT", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)
              ? v.slice(0, 10).split("-").reverse().join("/")
              : v,
          width - 14,
        ),
      );
      const h = Math.max(...lines.map((l) => l.length)) * 12 + 16;
      if (y - h < 65) {
        addPage();
        rows[0].forEach((v, i) => draw(v, 36 + i * width, 9, true));
        y -= 28;
      }
      page.drawRectangle({
        x: 32,
        y: y - h + 10,
        width: 778,
        height: h,
        color: r % 2 ? rgb(0.96, 0.98, 1) : rgb(0.91, 0.95, 0.97),
      });
      const start = y;
      lines.forEach((ls, i) =>
        ls.forEach((line, n) => {
          y = start - n * 12;
          draw(line, 36 + i * width, 9, r === 0);
        }),
      );
      y = start - h;
    }
    if (rows.length === 1) {
      draw("Nessun movimento registrato nel periodo.", 36);
      y -= 25;
    }
    for (const p of pdf.getPages())
      p.drawText(
        "Report gestionale · Shop incluso in Cassa · Magazzino: quantita · Costi solo se registrati",
        { x: 36, y: 27, size: 8, font, color: rgb(0.35, 0.42, 0.5) },
      );
    files.push({
      filename: `SalonPro-${s.month.slice(0, 7)}-${section}.pdf`,
      content: base64(await pdf.save()),
    });
  }
  return files;
}
