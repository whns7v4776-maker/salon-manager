export type Snapshot = {
  month: string;
  salon: string;
  expenses: any[];
  cash: any[];
  sales: any[];
  saleLines: any[];
  returns: any[];
  stock: any[];
};
export const sections = ["Cassa", "Shop", "Magazzino", "Spese"] as const;
const eur = (n: number) => Number(n) / 100;
const safe = (v: unknown) => String(v ?? "").replace(/^[=+@\-\t\r]/, "'$&");
export function reportData(s: Snapshot) {
  const valid = s.cash.filter(
    (c) =>
      !String(c.description).startsWith("Incasso automatico fine giornata"),
  );
  const paid = valid.filter((c) => c.payment_method);
  const incoming = paid.reduce(
    (a, c) => a + Math.round(Number(c.amount) * 100),
    0,
  );
  const expenses = s.expenses
    .filter((e) => e.paid)
    .reduce((a, e) => a + Number(e.amount_cents), 0);
  const pending = s.expenses
    .filter((e) => !e.paid)
    .reduce((a, e) => a + Number(e.amount_cents), 0);
  const shop =
    s.sales.reduce((a, e) => a + Number(e.total_cents), 0) -
    s.returns.reduce((a, e) => a + Number(e.amount_cents), 0);
  const notes =
    "Report gestionale. Incassi Shop gia inclusi nella Cassa: non sommare i due totali. I carichi di magazzino non sono spese pagate. Costi limitati alle spese registrate; il saldo non e un utile fiscale. Commissioni, IVA e paghe non sono riconciliate.";
  return {
    incoming,
    expenses,
    pending,
    shop,
    balance: incoming - expenses,
    notes,
    metrics: {
      Cassa: [
        ["Incassi confermati", eur(incoming)],
        [
          "Da incassare",
          valid
            .filter((c) => !c.payment_method)
            .reduce((a, c) => a + Number(c.amount), 0),
        ],
        ["Movimenti", paid.length],
      ],
      Shop: [
        ["Vendite nette", eur(shop)],
        [
          "Resi",
          eur(s.returns.reduce((a, r) => a + Number(r.amount_cents), 0)),
        ],
        [
          "Costo vendite prima dei resi",
          eur(
            s.saleLines.reduce(
              (a, l) => a + Number(l.quantity) * Number(l.unit_cost_cents),
              0,
            ),
          ),
        ],
      ],
      Magazzino: [
        ["Movimenti", s.stock.length],
        ["Carichi", s.stock.filter((m) => m.action === "receive").length],
        ["Consumi", s.stock.filter((m) => m.action === "consume").length],
      ],
      Spese: [
        ["Spese pagate", eur(expenses)],
        ["Da pagare", eur(pending)],
        ["Spese registrate", s.expenses.length],
      ],
    },
    rows: {
      Cassa: [
        ["Data", "Descrizione", "Importo EUR", "Metodo", "Stato"],
        ...s.cash.map((c) => [
          c.created_at,
          safe(c.description),
          Number(c.amount),
          c.payment_method || "—",
          String(c.description).startsWith("Incasso automatico fine giornata")
            ? "Da verificare"
            : c.payment_method
              ? "Confermato"
              : "Da incassare",
        ]),
      ],
      Shop: [
        [
          "Tipo",
          "Data",
          "Descrizione",
          "Quantita",
          "Importo EUR",
          "Costo unitario EUR",
        ],
        ...s.saleLines.map((l) => [
          "Vendita",
          s.sales.find((x) => x.id === l.sale_id)?.created_at || "",
          safe(l.name),
          Number(l.quantity),
          eur(Number(l.unit_price_cents) * Number(l.quantity)),
          eur(l.unit_cost_cents),
        ]),
        ...s.returns.map((r) => [
          "Reso",
          r.created_at,
          safe(r.reason),
          Number(r.quantity),
          -eur(r.amount_cents),
          "",
        ]),
      ],
      Magazzino: [
        [
          "Data",
          "Prodotto",
          "Destinazione",
          "Variazione",
          "Operazione",
          "Causale",
        ],
        ...s.stock.map((m) => [
          m.created_at,
          safe(m.name),
          m.bucket === "retail" ? "Vendita" : "Uso professionale",
          Number(m.delta),
          m.action || "Vendita / reso",
          safe(m.reason),
        ]),
      ],
      Spese: [
        ["Data", "Categoria", "Descrizione", "Importo EUR", "Stato"],
        ...s.expenses.map((e) => [
          e.expense_date,
          e.category,
          safe(e.description),
          eur(e.amount_cents),
          e.paid ? "Pagata" : "Da pagare",
        ]),
      ],
    },
  };
}
export const escapeHtml = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function reportEmail(s: Snapshot) {
  const d = reportData(s);
  const money = (n: number) =>
    eur(n).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  return `<!doctype html><html lang="it"><body style="margin:0;background:#f2f5f8;font-family:Arial,sans-serif;color:#20364d"><table role="presentation" width="100%"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="max-width:100%;background:white;border-radius:24px"><tr><td style="padding:32px"><img src="cid:salonpro-app-logo" width="150" alt="SalonPro"><p style="color:#16845d;font-size:12px;letter-spacing:2px">IL TUO MESE IN SALONPRO</p><h1 style="font-size:27px;margin:12px 0">Il resoconto di ${escapeHtml(s.salon)}</h1><p style="color:#64748b">${escapeHtml(s.month.slice(0, 7).split("-").reverse().join("/"))} · Tutti i dati registrati, in un unico invio.</p><table role="presentation" width="100%" cellpadding="14" style="background:#eff8f3;border-radius:16px"><tr><td>Incassi confermati</td><td align="right"><b>${money(d.incoming)}</b></td></tr><tr><td>Spese pagate</td><td align="right"><b>${money(d.expenses)}</b></td></tr><tr><td>Saldo incassi − spese</td><td align="right"><b>${money(d.balance)}</b></td></tr></table><h2 style="font-size:18px;margin-top:28px">I tuoi allegati</h2><p>Cassa, Shop, Magazzino e Spese: ogni sezione ha il suo PDF da leggere e il suo Excel da analizzare.</p><p style="font-size:13px;color:#64748b;line-height:1.6">Le vendite Shop sono già comprese negli incassi della Cassa. I movimenti di magazzino indicano quantità, non pagamenti. Il saldo considera solo le spese registrate e non rappresenta l’utile fiscale.</p><a href="https://salonpro.dev/cassa" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#20364d;color:white;text-decoration:none">Apri la tua Cassa</a><p style="font-size:12px;color:#64748b;margin-top:28px">Puoi gestire l’invio mensile dalla sezione Spese e report mensile di SalonPro.</p></td></tr></table></td></tr></table></body></html>`;
}
