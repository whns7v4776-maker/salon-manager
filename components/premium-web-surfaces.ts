import { Platform, StyleSheet } from "react-native";

type Tone = { night: boolean };
type GlassPart = "sheet" | "panel" | "footer";

/** Shared web finish. Geometry, controls and native surfaces stay with callers. */
export function popupGlass(
  p: Tone,
  part: GlassPart = "sheet",
): Record<string, any> {
  if (Platform.OS !== "web") return {};
  const sheet = part === "sheet";
  return {
    backgroundColor: p.night
      ? sheet
        ? "rgba(31,34,33,.98)"
        : "rgba(39,43,40,.94)"
      : sheet
        ? "rgba(234,230,222,.98)"
        : "rgba(248,246,240,.94)",
    backgroundImage: p.night
      ? "linear-gradient(135deg,rgba(255,255,255,.045),rgba(255,255,255,0) 58%)"
      : "linear-gradient(135deg,rgba(255,255,255,.24),rgba(255,255,255,.025) 65%)",
    backdropFilter: `blur(${sheet ? 24 : 18}px) saturate(110%)`,
    WebkitBackdropFilter: `blur(${sheet ? 24 : 18}px) saturate(110%)`,
    borderColor: p.night ? "rgba(237,233,220,.18)" : "rgba(255,255,255,.72)",
    boxShadow: `${sheet ? "0 18px 56px rgba(20,23,21,.14), " : ""}inset 0 1px 0 ${p.night ? "rgba(255,255,255,.055)" : "rgba(255,255,255,.55)"}`,
  };
}

/** Apply to named structural styles, never to payment/status badges or buttons. */
export function premiumWebCardStyles<T extends Record<string, any>>(
  base: T,
  p: Tone,
): T {
  if (Platform.OS !== "web") return base;
  const result: Record<string, any> = {};
  for (const [key, original] of Object.entries(base)) {
    const value: any = { ...StyleSheet.flatten(original) };
    if (/DialogOverlay$/.test(key)) {
      Object.assign(value, {
        justifyContent: "center", alignItems: "center", padding: 24,
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      });
    }
    if (/DialogShell$/.test(key)) {
      Object.assign(value, { minHeight: 0, maxHeight: "100%", flexShrink: 1 });
    }
    if (
      /(?:ModalCard|DialogCard|DialogSheet|DetailSheet|AcceptSheet|ManagementSheet|PolicySheet)$/.test(
        key,
      ) ||
      key === "sheet" ||
      key === "modal"
    ) {
      Object.assign(value, popupGlass(p));
    } else if (
      /(?:ModalActions|ComposerFooter|EditorFooter(?:Web)?|PolicyFooter|ModalFooter|SheetFooter)$/.test(
        key,
      )
    ) {
      Object.assign(value, popupGlass(p, "footer"));
    }
    if (/Card$|Board$|Sheet$/.test(key) && !/appointment|slot|stat|metric|status|badge|error|warning|success|drag|ghost|preview/i.test(key) && value.backgroundColor && value.backgroundColor !== 'transparent') {
      value.backgroundColor = p.night ? 'rgba(35,39,37,.95)' : 'rgba(248,246,240,.95)';
      value.backdropFilter = 'blur(18px) saturate(110%)';
      value.WebkitBackdropFilter = 'blur(18px) saturate(110%)';
    }
    if (/Card$|Copy$|Content$|Heading$/.test(key)) value.minWidth = 0;
    if (/(?:StatsGrid|OverviewGrid|MetricsGrid)$/.test(key)) {
      Object.assign(value, {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))",
      });
    }
    if (
      (/(?:StatNumber|MetricValue|OverviewCount|StatValue)$/.test(key) ||
        key === "total" ||
        key === "price") &&
      typeof value.fontSize === "number"
    ) {
      const size = value.fontSize;
      value.fontSize = `clamp(${Math.ceil(size * 0.86)}px,2.8vw,${size}px)`;
      value.whiteSpace = "nowrap";
      value.wordBreak = "normal";
      value.overflowWrap = "normal";
    }
    result[key] = value;
  }
  return result as T;
}
