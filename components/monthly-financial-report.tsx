import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import {useAccessAppearance} from './access-premium';
import {useCashPanelStyles} from './cash-web-panel';
import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { benefitOperationId } from "../src/lib/service-packages";
import { supabase } from "../src/lib/supabase";
import { CreationSheet } from "./creation-sheet";
import { HapticTouchable } from "./ui/haptic-touchable";
import { NativeDatePickerModal } from "./ui/native-date-picker-modal";
const categories = [
  "Affitto",
  "Utenze",
  "Fornitori",
  "Prodotti",
  "Servizi",
  "Altro",
];
const money = (c: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(
    c / 100,
  );
const today = () => new Date().toLocaleDateString("sv-SE");
const previousMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
export function MonthlyFinancialReport({
  workspaceId,
  email,
  inline = false,
}: {
  workspaceId: string;
  email: string;
  inline?: boolean;
}) {
  const s=useCashPanelStyles(baseCashStyles);
  const {palette:p}=useAccessAppearance();
  const draftId = useRef(benefitOperationId()),
    generation = useRef(0);
  const [revision, setRevision] = useState(0);
  const [open, setOpen] = useState(inline),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [enabled, setEnabled] = useState(false),
    [loaded, setLoaded] = useState(false),
    [reports, setReports] = useState<any[]>([]),
    [expenses, setExpenses] = useState<any[]>([]);
  const [month, setMonth] = useState(() => today().slice(0, 7) + "-01"),
    [date, setDate] = useState(today),
    [picker, setPicker] = useState<"month" | "expense" | null>(null);
  const [category, setCategory] = useState("Altro"),
    [description, setDescription] = useState(""),
    [amount, setAmount] = useState(""),
    [paid, setPaid] = useState(true),
    [editing, setEditing] = useState<string | null>(null);
  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoaded(false);
    const results = await Promise.all([
      supabase
        .from("monthly_report_settings")
        .select("enabled")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("monthly_financial_reports")
        .select("id,month,status,sent_at,recipient,attempts")
        .eq("workspace_id", workspaceId)
        .order("month", { ascending: false })
        .limit(36),
      (async () => {
        const rows: any[] = [];
        let after: string | undefined;
        for (;;) {
          let q = supabase
            .from("salon_expenses")
            .select("*")
            .eq("workspace_id", workspaceId)
            .gte("expense_date", month)
            .lt(
              "expense_date",
              new Date(
                Number(month.slice(0, 4)),
                Number(month.slice(5, 7)),
                1,
              ).toLocaleDateString("sv-SE"),
            )
            .order("id")
            .limit(500);
          if (after) q = q.gt("id", after);
          const r = await q;
          if (r.error) return r;
          rows.push(...r.data);
          if (r.data.length < 500)
            return {
              data: rows.sort((a, b) =>
                b.expense_date.localeCompare(a.expense_date),
              ),
              error: null,
            };
          after = r.data[r.data.length - 1].id;
        }
      })(),
    ]);
    if (token !== generation.current) return;
    if (results.some((r) => r.error)) {
      setError("Spese e report non disponibili. Riprova tra poco.");
      return;
    }
    setEnabled(!!results[0].data?.enabled);
    setReports(results[1].data || []);
    setExpenses(results[2].data || []);
    setLoaded(true);
    setError("");
  }, [workspaceId, month]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Operazione non riuscita. Riprova.",
      );
    } finally {
      setBusy(false);
    }
  };
  const rpc = async (name: string, args: any) => {
    const r = await supabase.rpc(name, args);
    if (r.error) throw Error(r.error.message);
    return r.data;
  };
  const clear = () => {
    draftId.current = benefitOperationId();
    setRevision(0);
    setEditing(null);
    setDescription("");
    setAmount("");
    setDate(today());
    setPaid(true);
    setCategory("Altro");
  };
  const save = () =>
    run(async () => {
      if (
        !/^\d{1,7}([.,]\d{1,2})?$/.test(amount.trim()) ||
        Number(amount.replace(",", ".")) <= 0 ||
        !description.trim()
      )
        throw Error(
          "Inserisci una descrizione e un importo valido maggiore di zero.",
        );
      await rpc("save_salon_expense", {
        p_id: editing || draftId.current,
        p_revision: revision,
        p_date: date,
        p_category: category,
        p_description: description,
        p_amount: Math.round(Number(amount.replace(",", ".")) * 100),
        p_paid: paid,
      });
      setMonth(date.slice(0, 7) + "-01");
      clear();
    });
  const download = (reportId: string, section: string, extension: string) =>
    run(async () => {
      const r = await supabase.functions.invoke("monthly-report", {
        body: { reportId, section, extension },
      });
      if (r.error || r.data?.error) {
        const detail = await r.error?.context?.json?.().catch(() => null);
        throw Error(
          detail?.error || r.data?.error || "Download non disponibile",
        );
      }
      const file = r.data.files.find((f: any) =>
        f.filename.endsWith(`-${section}.${extension}`),
      );
      if (!file) throw Error("Allegato non disponibile");
      const mime =
        extension === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob(
            [Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))],
            { type: mime },
          ),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        if (!FileSystem.cacheDirectory || !(await Sharing.isAvailableAsync()))
          throw Error("Condivisione non disponibile");
        const uri = FileSystem.cacheDirectory + file.filename;
        await FileSystem.writeAsStringAsync(uri, file.content, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(uri, { mimeType: mime });
      }
    });
  const button = (label: string, onPress: () => void, secondary = false) => (
    <HapticTouchable
      accessibilityRole="button"
      disabled={busy || !loaded}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        Platform.OS === "web" && {backgroundColor:label === "Elimina" ? (p.night ? "#452E33" : "#E9D1D0") : secondary ? p.field : p.action},
        (busy || !loaded) && { opacity: 0.5 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#20364D" }, Platform.OS === "web" && {color:label === "Elimina" ? (p.night ? "#F0B4BD" : "#963F48") : secondary ? p.ink : p.actionText}]}>
        {label}
      </Text>
    </HapticTouchable>
  );
  return (
    <>
      {!inline ? <HapticTouchable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={s.entry}
      >
        <View style={s.icon}>
          <Ionicons name="document-text-outline" size={23} color="#16845D" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Spese e report mensile</Text>
          <Text style={s.hint}>
            Registra le uscite e ritrova i tuoi resoconti.
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#526781" />
      </HapticTouchable> : null}
      {open ? (
        <MonthlyReportFrame inline={inline} busy={busy} onClose={() => {if (!busy) setOpen(false);}} overlays={<NativeDatePickerModal
            visible={picker !== null}
            title={picker === "month" ? "Scegli il mese" : "Data spesa"}
            initialValue={picker === "month" ? month : date}
            onClose={() => setPicker(null)}
            onConfirm={(v) => {
              if (picker === "month") setMonth(v.slice(0, 7) + "-01");
              else setDate(v);
              setPicker(null);
            }}
          />}>
            <View style={s.stack}>
              <View style={s.box}>
                <Text style={s.title}>Il tuo mese, nella tua mail</Text>
                <Text style={s.hint}>
                  Ogni giorno 1 viene preparato il mese precedente. Gli invii
                  partono dalle 09:00, ora italiana, alla mail del titolare:{" "}
                  {email}.
                </Text>
                {button(
                  enabled
                    ? "Invio mensile attivo · Disattiva"
                    : "Attiva il report via email",
                  () => {
                    if (loaded)
                      void run(async () => {
                        await rpc("set_monthly_report_enabled", {
                          p_enabled: !enabled,
                        });
                      });
                  },
                  !enabled,
                )}
                <Text style={s.hint}>
                  PDF ed Excel separati per Cassa, Shop, Magazzino e Spese. I
                  mesi già inviati restano archiviati.
                </Text>
              </View>
              {error ? (
                <View style={{ gap: 8 }}>
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                  {!loaded ? (
                    <HapticTouchable
                      accessibilityRole="button"
                      onPress={() => void load()}
                      style={s.secondary}
                    >
                      <Text>Riprova</Text>
                    </HapticTouchable>
                  ) : null}
                </View>
              ) : null}
              {Platform.OS === 'web' ? <CashReportDate label="Mese del report" type="month" value={month.slice(0,7)} onChange={value=>setMonth(value+'-01')} disabled={busy||!loaded}/> : button(`Mese: ${month.slice(0,7).split('-').reverse().join('/')}`,()=>setPicker('month'),true)}
              <View style={s.row}>
                <View style={s.metric}>
                  <Text style={s.hint}>Spese pagate</Text>
                  <Text style={s.title}>
                    {money(
                      expenses
                        .filter((e) => e.paid)
                        .reduce((a, e) => a + Number(e.amount_cents), 0),
                    )}
                  </Text>
                </View>
                <View style={s.metric}>
                  <Text style={s.hint}>Da pagare</Text>
                  <Text style={s.title}>
                    {money(
                      expenses
                        .filter((e) => !e.paid)
                        .reduce((a, e) => a + Number(e.amount_cents), 0),
                    )}
                  </Text>
                </View>
              </View>
              <View style={s.box}>
                <Text style={s.title}>
                  {editing ? "Modifica spesa" : "Nuova spesa"}
                </Text>
                <Text style={s.hint}>
                  Registra anche le fatture dei prodotti qui. I carichi di
                  magazzino non vengono conteggiati automaticamente come spese.
                </Text>
                <Text style={s.label}>Descrizione</Text>
                <TextInput
                  editable={!busy}
                  accessibilityLabel="Descrizione spesa"
                  placeholder="Es. Fattura prodotti ottobre"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={300}
                  style={s.input}
                />
                <Text style={s.label}>Importo in euro</Text>
                <TextInput
                  editable={!busy}
                  accessibilityLabel="Importo spesa in euro"
                  placeholder="0,00"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  style={s.input}
                />
                {Platform.OS === 'web' ? <CashReportDate label="Data della spesa" type="date" value={date} onChange={setDate} disabled={busy||!loaded}/> : button(`Data: ${date.split('-').reverse().join('/')}`,()=>setPicker('expense'),true)}
                <Text style={s.label}>Categoria</Text>
                <View style={s.chips}>
                  {categories.map((c) => (
                    <HapticTouchable
                      key={c}
                      accessibilityRole="button"
                      accessibilityState={{ selected: category === c }}
                      disabled={busy}
                      onPress={() => setCategory(c)}
                      style={[
                        s.chip,
                        category === c && { backgroundColor: Platform.OS === "web" ? p.action : "#20364D" },
                      ]}
                    >
                      <Text
                        style={{
                          color: Platform.OS === "web" ? (category === c ? p.actionText : p.ink) : category === c ? "white" : "#20364D",
                          fontWeight: "600",
                        }}
                      >
                        {c}
                      </Text>
                    </HapticTouchable>
                  ))}
                </View>
                {button(
                  paid ? "✓ Pagata" : "Da pagare",
                  () => setPaid(!paid),
                  !paid,
                )}
                {button(editing ? "Salva modifiche" : "Registra spesa", () => {
                  if (loaded) void save();
                })}
                {editing ? button("Annulla modifica", clear, true) : null}
              </View>
              {expenses.map((e) => (
                <View key={e.id} style={s.box}>
                  <View style={s.row}>
                    <Text style={[s.title, { flex: 1 }]}>{e.description}</Text>
                    <Text style={s.title}>{money(e.amount_cents)}</Text>
                  </View>
                  <Text style={s.hint}>
                    {e.expense_date.split("-").reverse().join("/")} ·{" "}
                    {e.category} · {e.paid ? "Pagata" : "Da pagare"}
                  </Text>
                  <View style={s.row}>
                    {button(
                      "Modifica",
                      () => {
                        setEditing(e.id);
                        setRevision(e.revision);
                        setDate(e.expense_date);
                        setCategory(e.category);
                        setDescription(e.description);
                        setAmount(
                          (e.amount_cents / 100).toFixed(2).replace(".", ","),
                        );
                        setPaid(e.paid);
                      },
                      true,
                    )}
                    {button(
                      "Elimina",
                      () => {
                        if (Platform.OS === "web") {
                          if (window.confirm("Eliminare questa spesa?"))
                            void run(async () => {
                              await rpc("delete_salon_expense", { p_id: e.id });
                            });
                          return;
                        }
                        Alert.alert(
                          "Elimina spesa",
                          "Confermi di eliminare questa spesa?",
                          [
                            { text: "Annulla", style: "cancel" },
                            {
                              text: "Elimina",
                              style: "destructive",
                              onPress: () =>
                                void run(async () => {
                                  await rpc("delete_salon_expense", {
                                    p_id: e.id,
                                  });
                                }),
                            },
                          ],
                        );
                      },
                      true,
                    )}
                  </View>
                </View>
              ))}
              {loaded && !expenses.length ? (
                <Text style={s.hint}>
                  Nessuna spesa registrata in questo mese.
                </Text>
              ) : null}
              {button(
                busy ? "Preparazione…" : "Prepara report del mese",
                () => {
                  if (loaded)
                    void run(async () => {
                      await rpc("prepare_financial_month", { p_month: month });
                    });
                },
              )}
              <Text style={s.title}>Archivio mensile</Text>
              <Text style={s.hint}>
                Il report corrente è provvisorio. Dopo il primo invio i dati del
                report restano conservati: le modifiche successive alle spese
                non cambiano gli allegati già inviati.
              </Text>
              {reports.map((r) => (
                <View key={r.id} style={s.box}>
                  <Text style={s.title}>
                    {r.month.slice(0, 7).split("-").reverse().join("/")}
                  </Text>
                  <Text style={s.hint}>
                    {r.status === "sent"
                      ? `Inviato a ${r.recipient}`
                      : r.status === "failed"
                        ? r.attempts < 5
                          ? "Invio non riuscito · nuovo tentativo automatico"
                          : "Invio non riuscito · allegati disponibili da scaricare"
                        : r.status === "sending"
                          ? "Invio in corso"
                          : "Pronto da scaricare"}
                  </Text>
                  {["Cassa", "Shop", "Magazzino", "Spese"].map((section) => (
                    <View
                      key={section}
                      style={[s.row, { alignItems: "center" }]}
                    >
                      <Text style={[s.label, { flex: 1 }]}>{section}</Text>
                      {button(
                        "PDF",
                        () => void download(r.id, section, "pdf"),
                        true,
                      )}
                      {button(
                        "Excel",
                        () => void download(r.id, section, "xlsx"),
                        true,
                      )}
                    </View>
                  ))}
                </View>
              ))}
            </View>
        </MonthlyReportFrame>
      ) : null}
    </>
  );
}
const baseCashStyles=StyleSheet.create({
  entry: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  icon: { backgroundColor: "#EAF7F0", padding: 12, borderRadius: 15 },
  stack: { gap: 14 },
  box: {
    padding: 16,
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCE5EE",
    borderRadius: 20,
  },
  row: { flexDirection: "row", gap: 8 },
  metric: {
    flex: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#EFF8F3",
    gap: 5,
  },
  title: { fontSize: 17, fontWeight: "700", color: "#20364D" },
  hint: { fontSize: 13, lineHeight: 20, color: "#64748B" },
  label: { fontSize: 13, fontWeight: "600", color: "#526781" },
  input: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DCE5EE",
    fontSize: 16,
    color: "#20364D",
    backgroundColor: "#F7FAFC",
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: "#16845D",
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: { backgroundColor: "#EFF4F8" },
  buttonText: {
    color: "white",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#EFF4F8", padding: 10, borderRadius: 12 },
  error: { color: "#B42318", fontSize: 14 },
});

function MonthlyReportFrame({inline,busy,onClose,children,overlays}:{inline:boolean;busy:boolean;onClose:()=>void;children:React.ReactNode;overlays:React.ReactNode}){
 if(inline)return <>{children}{overlays}</>;
 return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} transparent animationType="none" onRequestClose={onClose}><CreationSheet title="Spese e report mensile" icon="document-text-outline" animatePresentation dismissDisabled={busy} onClose={onClose}>{children}</CreationSheet>{overlays}</Modal>;
}

function CashReportDate({label,type,value,onChange,disabled}:{label:string;type:'month'|'date';value:string;onChange:(value:string)=>void;disabled:boolean}){
 const {palette:p}=useAccessAppearance();
 return <View style={{gap:8}}><Text style={{fontSize:13,color:p.muted}}>{label}</Text>{React.createElement('input',{'aria-label':label,type,value,disabled,onChange:(event:React.ChangeEvent<HTMLInputElement>)=>{if(event.target.value)onChange(event.target.value);},style:{height:48,padding:'0 14px',border:`1px solid ${p.border}`,borderRadius:11,background:p.field,color:p.ink,colorScheme:p.night?'dark':'light',font:'inherit',width:'100%',boxSizing:'border-box'}})}</View>;
}
