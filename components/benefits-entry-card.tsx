import { useCustomerPremiumStyles } from './owner-premium-customers-style';
import React from "react";
import { Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { HapticTouchable } from "./ui/haptic-touchable";
export function BenefitsEntryCard({ onPress, compactWeb=false }: { compactWeb?:boolean; onPress: (section?: "settings" | "packages" | "points" | "gifts") => void }) {
 const s=useCustomerPremiumStyles(baseCustomerComponentStyles);

  const { width } = useWindowDimensions();
  const compact = width < 600;
  const CardSurface=Platform.OS==='web'?View:HapticTouchable;
  return (
    <CardSurface {...(Platform.OS!=='web'?{onPress:()=>onPress("settings"),accessibilityRole:"button" as const,accessibilityLabel:"Apri Pacchetti e vantaggi del salone"}:{})} style={[s.card, compact && s.compact,compactWeb&&{padding:20,gap:14,marginBottom:0,minHeight:224,flex:1,borderRadius:18}]}>
      <View style={s.topline}>
        <View style={s.brand}>
          <View style={[s.gift,compactWeb&&{width:40,height:40,borderRadius:12}]}>
            <Ionicons name="gift-outline" size={compactWeb?24:28} color="#AC3654" />
          </View>
          <Text style={s.eyebrow}>DEDICATO AI TUOI CLIENTI</Text>
        </View>
        
      </View>
      <View style={[s.content, !compact && s.wide]}>
        <View style={s.heading}>
          <Text style={[s.title, compact && s.titleCompact,compactWeb&&{fontSize:22,lineHeight:28,fontWeight:"400",fontFamily:"Georgia"}]}>
            Pacchetti e vantaggi
          </Text>
          <Text style={[s.copy,compactWeb&&{fontSize:12,lineHeight:18}]}>
            Un motivo in più per tornare nel tuo salone.
          </Text>
        </View>
        <HapticTouchable accessibilityRole="button" accessibilityLabel="Gestisci pacchetti e vantaggi" onPress={()=>onPress("settings")} style={[s.action, compact && s.actionCompact]}>
          <Text style={s.actionText}>Gestisci</Text>
          <Ionicons name="arrow-forward" size={18} color={s.__premiumIcon?.color||"#FFFFFF"} />
        </HapticTouchable>
      </View>
      <View style={s.divider} />
      <View style={s.features}>
        {(
          [
            ["layers-outline", "Abbonamenti", "packages"],
            ["gift-outline", "Gift card", "gifts"],
            ["heart-outline", "Fedeltà", "points"],
          ] as const
        ).map(([icon, label, section]) => (
          <HapticTouchable key={label} accessibilityRole="button" accessibilityLabel={`Apri ${label}`} onPress={()=>onPress(section)} style={s.feature}>
            <Ionicons name={icon} size={15} color="#AC3654" />
            <Text style={s.featureText}>{label}</Text>
          </HapticTouchable>
        ))}
      </View>
    </CardSurface>
  );
}
const baseCustomerComponentStyles = StyleSheet.create({
  card: {
    padding: 24,
    borderRadius: 28,
    marginBottom: 18,
    backgroundColor: "#FFFAFC",
    borderWidth: 1,
    borderColor: "#EAD6DD",
    shadowColor: "#633A4A",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.055,
    shadowRadius: 20,
    elevation: 2,
    gap: 18,
  },
  compact: { padding: 20, gap: 15, borderRadius: 24 },
  topline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  gift: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: "#F8E6EC",
    borderWidth: 1,
    borderColor: "#F1D5DF",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    flexShrink: 1,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "800",
    color: "#986A7A",
  },
  content: { gap: 16 },
  wide: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { flex: 1, gap: 7 },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: "#302832",
  },
  titleCompact: { fontSize: 23, lineHeight: 29 },
  copy: { fontSize: 14, lineHeight: 21, color: "#7E7079" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 13,
    paddingHorizontal: 21,
    borderRadius: 16,
    backgroundColor: "#953651",
    shadowColor: "#953651",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 8,
  },
  actionCompact: {
    alignSelf: "flex-start",
    paddingVertical: 11,
    paddingHorizontal: 19,
  },
  actionText: { fontSize: 14, fontWeight: "700", color: "#FFFFFF" },
  divider: { height: 1, backgroundColor: "#F0E3E8" },
  features: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  feature: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: "#F8F0F3",
  },
  featureText: { fontSize: 12, fontWeight: "600", color: "#725564" },
});

