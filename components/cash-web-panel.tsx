import {nativeSectionStyles,useNativePremium} from './owner-native-premium';
import { premiumWebCardStyles } from "./premium-web-surfaces";
import React, { useMemo } from "react";
import { Platform, Text, View, useWindowDimensions } from "react-native";
import { useAccessAppearance } from "./access-premium";
/** Shares the cash palette across web and Premium native, preserving action handlers. */
export function useCashPanelStyles<T extends Record<string, any>>(base: T): T {
  const { palette: p } = useAccessAppearance();
  const { height } = useWindowDimensions();
  const native=useNativePremium();
  return useMemo(() => {
    // Cash panels only live in the owner back office: always in the premium theme,
    // also inside native sheets that sit outside the NativePremiumScope.
    void native;
    const result: any = {};
    for (const [name, value] of Object.entries(base)) {
      const style: any = { ...value };
      if (style.color && !/error|warning|success|badge|status/i.test(name))
        style.color = /text|caption|note|subtitle|hint|footnote/i.test(name)
          ? p.muted
          : p.ink;
      if (
        style.backgroundColor &&
        style.backgroundColor !== "transparent" &&
        !/qr|error|success|badge|status|dot/i.test(name)
      )
        style.backgroundColor = /card|modal/i.test(name)
          ? p.night
            ? "#292A27"
            : "#D8D0C4"
          : p.field;
      for (const key of Object.keys(style))
        if (key.startsWith("border") && key.endsWith("Color"))
          style[key] = p.border;
      if (/primary|buttonDark/i.test(name) && style.backgroundColor)
        style.backgroundColor = p.action;
      if (/primary.*text|buttonDarkText/i.test(name))
        style.color = p.actionText;
      if (/selected|active/i.test(name) && style.backgroundColor)
        style.backgroundColor = p.night
          ? "rgba(216,194,155,.16)"
          : "rgba(52,55,53,.10)";
      if (/title/i.test(name) && !/subtitle/i.test(name) && style.fontSize) {
        style.fontFamily = "Georgia";
        style.fontWeight = "400";
        style.fontSize = Math.max(20, style.fontSize);
      }
      if (style.borderRadius !== undefined && !/icon|dot/i.test(name))
        style.borderRadius = /card|modal/i.test(name) ? 18 : 11;
      if (style.shadowOpacity !== undefined) {
        style.shadowOpacity = 0;
        style.elevation = 0;
      }
      if (/backdrop/i.test(name)) {
        style.backgroundColor = "rgba(25,22,19,.35)";
        style.backdropFilter = "blur(9px)";
        style.justifyContent = "center";
        style.alignItems = "center";
        style.padding = 24;
      }
      if (/modalScroll/i.test(name)) {
        style.justifyContent = "center";
        style.padding = 24;
      }
      if (name === "modal") {
        style.maxHeight = height - 48;
        style.borderBottomLeftRadius = 22;
        style.borderBottomRightRadius = 22;
      }
      result[name] = style;
    }
    if(Platform.OS !== 'web'){
      const mapped=nativeSectionStyles(result,p) as Record<string,any>;
      for(const key of Object.keys(mapped)){
        if(/primary.*text|buttonDarkText/i.test(key))mapped[key]={...mapped[key],color:p.actionText};
        if(/primary.*button$|buttonDark$/i.test(key))mapped[key]={...mapped[key],backgroundColor:p.action,borderColor:p.action};
      }
      return mapped as T;
    }
    return premiumWebCardStyles(result, p);
  }, [base, p, height, native]);
}
export function CashWebPanel({
  children,
  emptyText = "Nessuna opzione disponibile in questo momento per il salone.",
}: {
  children: React.ReactNode;
  emptyText?: string;
}) {
  const { palette: p } = useAccessAppearance();
  return (
    <View {...{ dataSet: { cashLegacyPanel: "true" } }} style={{ gap: 18 }}>
      {React.createElement(
        "style",
        null,
        `
 [data-cash-panel-empty]{display:none;}[data-cash-panel-content]:empty + [data-cash-panel-empty]{display:flex;}
 [data-cash-legacy-panel] input,[data-cash-legacy-panel] textarea{background:${p.night ? "#30312D" : "#EAE4DA"}!important;color:${p.ink}!important;}
 `,
      )}
      <View {...{ dataSet: { cashPanelContent: "true" } }}>{children}</View>
      <View
        {...{ dataSet: { cashPanelEmpty: "true" } }}
        style={{ gap: 10, paddingVertical: 14 }}
      >
        <Text style={{ fontSize: 16, color: p.ink }}>{emptyText}</Text>
        <Text style={{ fontSize: 14, lineHeight: 22, color: p.muted }}>
          La disponibilità dipende dalla configurazione del salone e dal
          collegamento al server. Puoi continuare a registrare gli incassi già
          ricevuti in Cassa.
        </Text>
      </View>
    </View>
  );
}
