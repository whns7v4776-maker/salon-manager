import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { popupGlass } from "./premium-web-surfaces";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useAccessAppearance } from "./access-premium";
import { ServicesEditorStyle } from "./services-web-editor";
export function CashWebDialog({
  title,
  onClose,
  children,
  footer,
  busy = false,
  expanded = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  expanded?: boolean;
}) {
  const { palette: p } = useAccessAppearance();
  const { height } = useWindowDimensions();
  return (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View
        style={
          {
            flex: 1,
            padding: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(25,22,19,.35)",
            backdropFilter: "blur(9px)",
            WebkitBackdropFilter: "blur(9px)",
          } as any
        }
      >
        <View
          {...{ dataSet: { servicesEditor: "true", cashDialog: "true" } }}
          style={{
            width: "100%",
            maxWidth: expanded ? 1400 : 940,
            height: expanded ? Math.max(200, height - 48) : undefined,
            maxHeight: Math.max(200, height - 48),
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: p.night ? "#222321" : "#DED7CD",
            ...popupGlass(p),
            borderWidth: 1,
            borderColor: p.border,
          }}
        >
          <ServicesEditorStyle />
          <View
            style={{
              padding: 24,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderBottomWidth: 1,
              borderColor: p.line,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: "Georgia",
                fontSize: 27,
                color: p.ink,
              }}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chiudi finestra Cassa"
              disabled={busy}
              onPress={onClose}
              style={{
                padding: 9,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: p.border,
              }}
            >
              <Ionicons name="close" size={20} color={p.ink} />
            </Pressable>
          </View>
          <ScrollView
            style={{ flexShrink: 1, flex: expanded ? 1 : undefined }}
            contentContainerStyle={{
              padding: 24,
              gap: 20,
              flex: expanded ? 1 : undefined,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          <View
            style={{
              padding: 18,
              paddingHorizontal: 24,
              borderTopWidth: 1,
              borderColor: p.line,
              backgroundColor: p.night ? "#2A2A27" : "#D1C8BA",
              ...popupGlass(p, "footer"),
              alignItems: "flex-end",
            }}
          >
            {footer ?? (
              <Pressable
                accessibilityRole="button"
                onPress={onClose}
                disabled={busy}
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 11,
                  backgroundColor: p.action,
                }}
              >
                <Text style={{ color: p.actionText, fontSize: 13 }}>
                  Chiudi
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
