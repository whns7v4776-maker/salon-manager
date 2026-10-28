import { useCustomerPremiumColor } from './owner-premium-customers-style';
import React, { useState } from "react";
import { Text, View } from "react-native";
import { NativeDatePickerModal } from "./ui/native-date-picker-modal";
import { HapticTouchable } from "./ui/haptic-touchable";
export function BenefitDateField({
  label,
  value,
  onChange,
  disabled = false,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  optional?: boolean;
}) {
 const premiumColor=useCustomerPremiumColor();

  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: "600", color: premiumColor("#334155","color") }}>{label}</Text>
      <HapticTouchable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        style={{
          padding: 14,
          borderRadius: 14,
          backgroundColor: premiumColor("#FFF","backgroundColor"),
          borderWidth: 1,
          borderColor: premiumColor("#DAE3E9","borderColor"),
        }}
      >
        <Text>
          {value ? value.split("-").reverse().join("/") : "Senza scadenza"}
        </Text>
      </HapticTouchable>
      {optional && value ? (
        <HapticTouchable disabled={disabled} onPress={() => onChange("")}>
          <Text>Rimuovi scadenza</Text>
        </HapticTouchable>
      ) : null}
      <NativeDatePickerModal
        visible={open}
        title={label}
        initialValue={value}
        onClose={() => setOpen(false)}
        onConfirm={(v) => {
          onChange(v);
          setOpen(false);
        }}
      />
    </View>
  );
}
