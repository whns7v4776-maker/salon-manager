import { PremiumChoiceRow } from './ui/premium-choice-row';
import { PremiumSectionHeader } from './ui/premium-section-heading';
import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { NativeReadableText as Text } from './owner-native-premium';
import { useCustomerPremiumColor, useCustomerPremiumStyles } from './owner-premium-customers-style';
import { CustomerPopupClose } from './customer-popup-close';
import { CustomerPopupSkin } from './customer-popup-skin';
import { NativeMedal } from './owner-premium-native-home';
import { useAccessAppearance } from './access-premium';
import { CustomerSheetFrame, useCustomerSheetDockStyle } from "./customer-sheet-frame";
import { CommunicationPosterPicker } from "./communication-poster";
import { supabase } from "../src/lib/supabase";
import { CustomerCommunicationPopups } from "./customer-communication-popups";
import { NativeDatePickerModal } from "./ui/native-date-picker-modal";
import { NativeTimePickerModal } from "./ui/native-time-picker-modal";
import { CommunicationScheduleFields, type CommunicationSchedule } from "./communication-schedule-fields";
import { ScheduledCustomerCommunications } from "./scheduled-customer-communications";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import {
  CustomerCommunicationTemplate,
  CustomerCommunicationTemplateIcon,
  deleteCustomerCommunicationTemplate,
  fetchCustomerCommunicationTemplates,
  saveCustomerCommunicationTemplate,
  sendCustomerCommunication,
} from "../src/lib/customer-communications";

import { HapticTouchable } from "./ui/haptic-touchable";

import { CommunicationPeriodFields, initialCommunicationPeriod, communicationPeriodPayload } from "./communication-period-fields";

type CommunicationClient = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
};

const showCommunicationNotice = (title: string, message: string) => {
  if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
};

const PROMOTION_TEMPLATE = {
  title: "Una nuova offerta per te",
  body: "Abbiamo preparato una nuova offerta: entra nel tuo account e prenota il tuo appuntamento!",
  icon: "pricetag" as const,
};

const HOLIDAY_TEMPLATE = {
  title: "Chiusura per ferie",
  body: "Dal 15/08/2026 al 31/08/2026 siamo chiusi per ferie. Giusto il tempo di ricaricare le batterie e poi ripartiamo a razzo. A presto!",
  icon: "umbrella" as const,
};

const TEMPLATE_ICON_OPTIONS: {
  key: CustomerCommunicationTemplateIcon;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
}[] = [
  { key: "megaphone", icon: "megaphone-outline", label: "Avviso" },
  { key: "pricetag", icon: "pricetag-outline", label: "Offerta" },
  { key: "gift", icon: "gift-outline", label: "Regalo" },
  { key: "calendar", icon: "calendar-outline", label: "Data" },
  { key: "umbrella", icon: "umbrella-outline", label: "Ferie" },
  { key: "storefront", icon: "storefront-outline", label: "Apertura" },
  { key: "heart", icon: "heart-outline", label: "Cuore" },
  { key: "sparkles", icon: "sparkles-outline", label: "Novità" },
  { key: "notifications", icon: "notifications-outline", label: "Promemoria" },
  { key: "bookmark", icon: "bookmark-outline", label: "Generico" },
];

const getTemplateIconName = (
  icon: CustomerCommunicationTemplateIcon,
): React.ComponentProps<typeof Ionicons>["name"] =>
  TEMPLATE_ICON_OPTIONS.find((option) => option.key === icon)?.icon ??
  "bookmark-outline";

function TemplateIconGlyph({
  icon,
  size,
  color,
}: {
  icon: CustomerCommunicationTemplateIcon;
  size: number;
  color: string;
}) {
  if (icon === "umbrella") {
    return (
      <MaterialCommunityIcons
        name="umbrella-beach-outline"
        size={size}
        color={color}
      />
    );
  }

  return (
    <Ionicons name={getTemplateIconName(icon)} size={size} color={color} />
  );
}

type CommunicationDraft = {
  title: string;
  body: string;
};

type CommunicationDraftValidity = {
  title: boolean;
  body: boolean;
};

type CommunicationDraftSeed = {
  revision: number;
  value: CommunicationDraft;
};

type CommunicationQuerySeed = {
  revision: number;
  value: string;
};

const EMPTY_COMMUNICATION_DRAFT: CommunicationDraft = {
  title: "",
  body: "",
};

const getCommunicationDraftValidity = (
  draft: CommunicationDraft,
): CommunicationDraftValidity => ({
  title: draft.title.trim().length >= 2,
  body: draft.body.trim().length >= 2,
});

const CommunicationDraftFields = memo(function CommunicationDraftFields({
  seed,
  draftRef,
  onValidityChange,
}: {
  seed: CommunicationDraftSeed;
  draftRef: React.MutableRefObject<CommunicationDraft>;
  onValidityChange: (validity: CommunicationDraftValidity) => void;
}) {
 const premiumColor=useCustomerPremiumColor();

 const styles=useCustomerPremiumStyles(baseCustomerComponentStyles);

  const [draft, setDraft] = useState<CommunicationDraft>(seed.value);
  const lastValidityRef = useRef<CommunicationDraftValidity>(
    getCommunicationDraftValidity(seed.value),
  );

  const publishValidity = useCallback(
    (nextDraft: CommunicationDraft) => {
      const nextValidity = getCommunicationDraftValidity(nextDraft);
      const previousValidity = lastValidityRef.current;
      if (
        previousValidity.title === nextValidity.title &&
        previousValidity.body === nextValidity.body
      ) {
        return;
      }
      lastValidityRef.current = nextValidity;
      onValidityChange(nextValidity);
    },
    [onValidityChange],
  );

  useEffect(() => {
    const nextDraft = { ...seed.value };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
    publishValidity(nextDraft);
  }, [draftRef, publishValidity, seed]);

  const changeDraft = useCallback(
    (field: keyof CommunicationDraft, value: string) => {
      const nextDraft = {
        ...draftRef.current,
        [field]: value,
      };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      publishValidity(nextDraft);
    },
    [draftRef, publishValidity],
  );

  return (
    <>
      <Text style={styles.sectionLabel}>Titolo</Text>
      <TextInput
        value={draft.title}
        onChangeText={(value) => changeDraft("title", value)}
        maxLength={80}
        placeholder="Es. Una nuova offerta per te"
        placeholderTextColor={premiumColor("#8b94a7","placeholderTextColor")}
        style={styles.input}
      />

      <View style={styles.labelRow}>
        <Text style={styles.sectionLabel}>Messaggio</Text>
        <Text style={styles.counter}>{draft.body.length}/500</Text>
      </View>
      <TextInput
        value={draft.body}
        onChangeText={(value) => changeDraft("body", value)}
        maxLength={500}
        multiline
        textAlignVertical="top"
        placeholder="Scrivi il messaggio che riceveranno i clienti..."
        placeholderTextColor={premiumColor("#8b94a7","placeholderTextColor")}
        style={[styles.input, styles.messageInput]}
      />
    </>
  );
});

const DeferredCommunicationQueryInput = memo(
  function DeferredCommunicationQueryInput({
    seed,
    onCommit,
  }: {
    seed: CommunicationQuerySeed;
    onCommit: (value: string) => void;
  }) {
 const premiumColor=useCustomerPremiumColor();

 const styles=useCustomerPremiumStyles(baseCustomerComponentStyles);

    const [value, setValue] = useState(seed.value);
    const valueRef = useRef(seed.value);
    const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearPendingCommit = useCallback(() => {
      if (!pendingTimerRef.current) return;
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }, []);

    useEffect(() => {
      clearPendingCommit();
      valueRef.current = seed.value;
      setValue(seed.value);
    }, [clearPendingCommit, seed]);

    useEffect(
      () => () => {
        clearPendingCommit();
      },
      [clearPendingCommit],
    );

    const commitCurrentValue = useCallback(() => {
      clearPendingCommit();
      onCommit(valueRef.current);
    }, [clearPendingCommit, onCommit]);

    const handleChange = useCallback(
      (nextValue: string) => {
        valueRef.current = nextValue;
        setValue(nextValue);
        clearPendingCommit();
        pendingTimerRef.current = setTimeout(() => {
          pendingTimerRef.current = null;
          onCommit(nextValue);
        }, 100);
      },
      [clearPendingCommit, onCommit],
    );

    return (
      <PremiumSearchToolbar><TextInput
        value={value}
        onChangeText={handleChange}
        onBlur={commitCurrentValue}
        onSubmitEditing={commitCurrentValue}
        placeholder="Cerca cliente, email o telefono"
        placeholderTextColor={premiumColor("#8b94a7","placeholderTextColor")}
        style={styles.input}
      /></PremiumSearchToolbar>
    );
  },
);

function CompactChoiceRow({ children, style }: React.PropsWithChildren<{style: import('react-native').StyleProp<import('react-native').ViewStyle>}>) {
  return <PremiumChoiceRow style={style}>{children}</PremiumChoiceRow>;
}

/** Skinned popup: richer light-theme edges, fields and bronze selection. */
export function CustomerCommunicationsModal(props: React.ComponentProps<typeof CustomerCommunicationsModalBody>) {
  return <CustomerPopupSkin><CustomerCommunicationsModalBody {...props} /></CustomerPopupSkin>;
}
function CustomerCommunicationsModalBody({
  visible,
  clients,
  onClose,
}: {
  visible: boolean;
  clients: CommunicationClient[];
  onClose: () => void;
}) {
 const premiumNight=useAccessAppearance().palette.night;
 const premiumColor=useCustomerPremiumColor();

 const styles=useCustomerPremiumStyles(baseCustomerComponentStyles);

  const dockStyle = useCustomerSheetDockStyle();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    if (!visible || Platform.OS === 'web') { setKeyboardOpen(false); return; }
    setKeyboardOpen(Keyboard.isVisible());
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  const contentScrollRef = useRef<ScrollView>(null);
  const contentOffsetRef = useRef(0);
  const revealFrameRef = useRef<number | null>(null);
  const revealFocusedInput = useCallback(() => {
    if (Platform.OS === 'web') return;
    if (revealFrameRef.current !== null) cancelAnimationFrame(revealFrameRef.current);
    revealFrameRef.current = requestAnimationFrame(() => {
      revealFrameRef.current = null;
      const input = TextInput.State.currentlyFocusedInput();
      const viewport = contentScrollRef.current;
      if (!input || !viewport) return;
      const nativeViewport = viewport.getNativeScrollRef() as View | null;
      nativeViewport?.measureInWindow((_x, top, _w, height) => {
        input.measureInWindow((_ix, y, _iw, inputHeight) => {
          if (TextInput.State.currentlyFocusedInput() !== input || height <= 0) return;
          const bottom = Math.min(y + inputHeight, y + height - 24);
          const delta = y < top + 12 ? y - top - 12 : Math.max(0, bottom - (top + height - 12));
          if (Math.abs(delta) > 1) viewport.scrollTo({y:Math.max(0,contentOffsetRef.current + delta),animated:false});
        });
      });
    });
  }, []);
  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    const subscription = Keyboard.addListener('keyboardDidShow', revealFocusedInput);
    return () => {
      subscription.remove();
      if (revealFrameRef.current !== null) cancelAnimationFrame(revealFrameRef.current);
    };
  }, [visible, revealFocusedInput]);
  const [picker, setPicker] = useState<{ kind: "date" | "time"; initial: string; confirm: (v: string) => void } | null>(null);
  const openPicker = (kind: "date" | "time", initial: string, confirm: (v: string) => void) => setPicker({ kind, initial, confirm });
  const [schedule, setSchedule] = useState<CommunicationSchedule>({ enabled: false, date: initialCommunicationPeriod().from, time: "09:00" });
  const [scheduledRevision, setScheduledRevision] = useState(0);
  const [section, setSection] = useState<"compose" | "scheduled" | "popups">("compose");
  const [period, setPeriod] = useState(initialCommunicationPeriod);
  const sendAttemptRef = useRef<{ signature: string; key: string } | null>(null);
  const communicationDraftRef = useRef<CommunicationDraft>({
    ...EMPTY_COMMUNICATION_DRAFT,
  });
  const [communicationDraftSeed, setCommunicationDraftSeed] =
    useState<CommunicationDraftSeed>({
      revision: 0,
      value: { ...EMPTY_COMMUNICATION_DRAFT },
    });
  const [communicationDraftValidity, setCommunicationDraftValidity] =
    useState<CommunicationDraftValidity>({ title: false, body: false });
  const [query, setQuery] = useState("");
  const [querySeed, setQuerySeed] = useState<CommunicationQuerySeed>({
    revision: 0,
    value: "",
  });
  const [audienceAll, setAudienceAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const sendLockRef = useRef(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateIcon, setTemplateIcon] =
    useState<CustomerCommunicationTemplateIcon>("megaphone");
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [templateActionsTemplateId, setTemplateActionsTemplateId] = useState<
    string | null
  >(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [templateEditSnapshot, setTemplateEditSnapshot] = useState<{
    title: string;
    body: string;
    icon: CustomerCommunicationTemplateIcon;
    activeTemplateId: string | null;
  } | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<
    CustomerCommunicationTemplate[]
  >([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(
    null,
  );
  const [templatePendingDelete, setTemplatePendingDelete] =
    useState<CustomerCommunicationTemplate | null>(null);
  const [templateFeedback, setTemplateFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const handleDraftValidityChange = useCallback(
    (nextValidity: CommunicationDraftValidity) => {
      setCommunicationDraftValidity((currentValidity) =>
        currentValidity.title === nextValidity.title &&
        currentValidity.body === nextValidity.body
          ? currentValidity
          : nextValidity,
      );
    },
    [],
  );

  const syncCommunicationDraft = useCallback((nextDraft: CommunicationDraft) => {
    const normalizedDraft = { ...nextDraft };
    communicationDraftRef.current = normalizedDraft;
    setCommunicationDraftValidity(getCommunicationDraftValidity(normalizedDraft));
    setCommunicationDraftSeed((currentSeed) => ({
      revision: currentSeed.revision + 1,
      value: normalizedDraft,
    }));
  }, []);

  const commitQuery = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
  }, []);

  const resetQuery = useCallback((nextQuery = "") => {
    setQuery(nextQuery);
    setQuerySeed((currentSeed) => ({
      revision: currentSeed.revision + 1,
      value: nextQuery,
    }));
  }, []);

  useEffect(() => {
    if (!visible) return;

    let active = true;
    setTemplatesLoading(true);
    setTemplateFeedback(null);

    void fetchCustomerCommunicationTemplates()
      .then((templates) => {
        if (!active) return;
        setSavedTemplates(templates);
      })
      .catch((error) => {
        console.log("Errore caricamento modelli comunicazioni clienti:", error);
        if (!active) return;
        setTemplateFeedback({
          tone: "error",
          text: "Non riesco a caricare i modelli salvati. Puoi comunque scrivere e inviare il messaggio.",
        });
      })
      .finally(() => {
        if (active) setTemplatesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [visible]);

  const eligibleClients = useMemo(
    () =>
      clients.filter(
        (client) => !!client.email?.trim() || !!client.phone?.trim(),
      ),
    [clients],
  );
  const visibleClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("it-IT");
    if (!normalizedQuery) return eligibleClients;
    return eligibleClients.filter((client) =>
      [client.name, client.email, client.phone]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("it-IT").includes(normalizedQuery),
        ),
    );
  }, [eligibleClients, query]);
  const selectedClients = useMemo(
    () => eligibleClients.filter((client) => selectedIds.has(client.id)),
    [eligibleClients, selectedIds],
  );
  const canSend =
    !uploadingPoster &&
    !sending &&
    !savingTemplate &&
    !deletingTemplateId &&
    communicationDraftValidity.title &&
    communicationDraftValidity.body &&
    (selectedClients.length > 0 || (period.enabled && audienceAll));
  const canSaveTemplate =
    !uploadingPoster &&
    !sending &&
    !savingTemplate &&
    !deletingTemplateId &&
    communicationDraftValidity.title &&
    communicationDraftValidity.body;

  const resetAndClose = () => {
    if (sending || uploadingPoster || savingTemplate || deletingTemplateId) return;
    setSchedule({ enabled: false, date: initialCommunicationPeriod().from, time: "09:00" });
    setPeriod(initialCommunicationPeriod());
    sendAttemptRef.current = null;
    syncCommunicationDraft({ ...EMPTY_COMMUNICATION_DRAFT }); setImagePath(null);
    resetQuery();
    setSelectedIds(new Set());
    setAudienceAll(false);
    setTemplateIcon("megaphone");
    setActiveTemplateId(null);
    setTemplateActionsTemplateId(null);
    setEditingTemplateId(null);
    setTemplateEditSnapshot(null);
    setTemplatePendingDelete(null);
    setTemplateFeedback(null);
    onClose();
  };

  const applyTemplate = (template: {
    title: string;
    body: string;
    icon: CustomerCommunicationTemplateIcon;
    id?: string;
  }) => {
    syncCommunicationDraft({ title: template.title, body: template.body });
    setTemplateIcon(template.icon);
    setActiveTemplateId(template.id ?? null);
    setEditingTemplateId(null);
    setTemplateEditSnapshot(null);
    setTemplatePendingDelete(null);
    setTemplateActionsTemplateId(null);
    setTemplateFeedback(null);
  };

  const templateActionsTemplate = useMemo(
    () =>
      savedTemplates.find(
        (template) => template.id === templateActionsTemplateId,
      ) ?? null,
    [savedTemplates, templateActionsTemplateId],
  );

  const openTemplateActions = (template: CustomerCommunicationTemplate) => {
    setActiveTemplateId(template.id);
    setTemplateActionsTemplateId(template.id);
    setEditingTemplateId(null);
    setTemplatePendingDelete(null);
    setTemplateFeedback(null);
  };

  const beginTemplateEditing = (template: CustomerCommunicationTemplate) => {
    const currentDraft = communicationDraftRef.current;
    setTemplateEditSnapshot({
      title: currentDraft.title,
      body: currentDraft.body,
      icon: templateIcon,
      activeTemplateId,
    });
    syncCommunicationDraft({ title: template.title, body: template.body });
    setTemplateIcon(template.icon);
    setActiveTemplateId(template.id);
    setEditingTemplateId(template.id);
    setTemplateActionsTemplateId(null);
    setTemplatePendingDelete(null);
    setTemplateFeedback(null);
  };

  const cancelTemplateEditing = () => {
    if (!editingTemplateId) return;
    if (templateEditSnapshot) {
      syncCommunicationDraft({
        title: templateEditSnapshot.title,
        body: templateEditSnapshot.body,
      });
      setTemplateIcon(templateEditSnapshot.icon);
      setActiveTemplateId(templateEditSnapshot.activeTemplateId);
    }
    setEditingTemplateId(null);
    setTemplateEditSnapshot(null);
    setTemplateActionsTemplateId(null);
    setTemplatePendingDelete(null);
    setTemplateFeedback(null);
  };

  const saveTemplate = async () => {
    const currentDraft = communicationDraftRef.current;
    const currentDraftValidity = getCommunicationDraftValidity(currentDraft);
    if (
      sending || uploadingPoster || sendLockRef.current ||
      savingTemplate ||
      deletingTemplateId ||
      !currentDraftValidity.title ||
      !currentDraftValidity.body
    ) {
      return;
    }

    setSavingTemplate(true);
    setTemplateFeedback(null);
    try {
      const savedTemplate = await saveCustomerCommunicationTemplate({
        title: currentDraft.title,
        body: currentDraft.body,
        icon: templateIcon,
        templateId: editingTemplateId,
      });
      setSavedTemplates((current) => [
        savedTemplate,
        ...current.filter((template) => template.id !== savedTemplate.id),
      ]);
      setActiveTemplateId(savedTemplate.id);
      const wasEditing = !!editingTemplateId;
      setEditingTemplateId(null);
      setTemplateEditSnapshot(null);
      setTemplateFeedback({
        tone: "success",
        text: wasEditing
          ? "Modello aggiornato per questo salone."
          : "Modello salvato per questo salone.",
      });
    } catch (error) {
      console.log("Errore salvataggio modello comunicazione clienti:", error);
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      setTemplateFeedback({
        tone: "error",
        text: message.includes("communication_template_limit_reached")
          ? "Hai raggiunto il limite di 20 modelli salvati."
          : message.includes("duplicate key") || message.includes("23505")
            ? "Esiste già un modello con questo titolo."
            : "Salvataggio non riuscito. Riprova tra poco.",
      });
    } finally {
      setSavingTemplate(false);
    }
  };

  const deleteTemplate = async () => {
    if (!templatePendingDelete || deletingTemplateId) return;

    const templateToDelete = templatePendingDelete;
    setDeletingTemplateId(templateToDelete.id);
    setTemplateFeedback(null);
    try {
      const deleted = await deleteCustomerCommunicationTemplate(
        templateToDelete.id,
      );
      if (!deleted) {
        throw new Error("customer_communication_template_not_found");
      }

      setSavedTemplates((current) =>
        current.filter((template) => template.id !== templateToDelete.id),
      );
      if (activeTemplateId === templateToDelete.id) {
        syncCommunicationDraft({ ...EMPTY_COMMUNICATION_DRAFT }); setImagePath(null);
        setTemplateIcon("megaphone");
        setActiveTemplateId(null);
        setTemplateActionsTemplateId(null);
        setEditingTemplateId(null);
        setTemplateEditSnapshot(null);
      }
      setTemplatePendingDelete(null);
      setTemplateFeedback({
        tone: "success",
        text: "Modello eliminato dal salone.",
      });
    } catch (error) {
      console.log("Errore eliminazione modello comunicazione clienti:", error);
      setTemplateFeedback({
        tone: "error",
        text: "Eliminazione non riuscita. Riprova tra poco.",
      });
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const toggleClient = (id: string) => {
    setAudienceAll(false);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setAudienceAll(!audienceAll);
    setSelectedIds(
      audienceAll
        ? new Set()
        : new Set(eligibleClients.map((client) => client.id)),
    );
  };

  const send = async () => {
    if (sendLockRef.current || uploadingPoster) return;
    const currentDraft = communicationDraftRef.current;
    const currentDraftValidity = getCommunicationDraftValidity(currentDraft);
    if (
      sending ||
      savingTemplate ||
      deletingTemplateId ||
      !currentDraftValidity.title ||
      !currentDraftValidity.body ||
      (selectedClients.length === 0 && !(period.enabled && audienceAll))
    ) {
      return;
    }

    if (period.enabled && !period.reuseText && (period.title.trim().length < 2 || period.body.trim().length < 2)) {
      showCommunicationNotice("Completa il popup", "Inserisci titolo e messaggio del promemoria, oppure usa il testo della comunicazione.");
      return;
    }
    const reminder = communicationPeriodPayload(period);
    if (reminder.startsLocal && reminder.endsLocal && reminder.endsLocal <= reminder.startsLocal) {
      showCommunicationNotice("Controlla il periodo", "La fine deve essere successiva all’inizio.");
      return;
    }
    const sendLocal = !period.enabled && schedule.enabled ? `${schedule.date}T${schedule.time}:00` : null;
    const signature = JSON.stringify([currentDraft, selectedClients.map(c => c.id).sort(), reminder, sendLocal, audienceAll, imagePath]);
    if (sendAttemptRef.current?.signature !== signature) {
      sendAttemptRef.current = { signature, key: `communication-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    }
    sendLockRef.current = true;
    setSending(true);
    try {
      if (period.enabled) {
        const { error } = await supabase.rpc('save_owner_customer_popup_v2', {
          p_title: reminder.title || currentDraft.title.trim(), p_body: reminder.body || currentDraft.body.trim(),
          p_targets: audienceAll ? [] : selectedClients.map(c => ({ id: c.id, email: c.email, phone: c.phone })),
          p_image_path: imagePath,
          p_all_customers: audienceAll, p_request_key: sendAttemptRef.current!.key,
          p_starts_local: reminder.startsLocal, p_ends_local: reminder.endsLocal,
        });
        if (error) throw error;
        showCommunicationNotice('Popup salvato', audienceAll ? 'Comparirà nel periodo scelto anche ai clienti che si registreranno. Nessuna push inviata.' : 'Comparirà ai clienti selezionati nel periodo scelto. Nessuna push inviata.');
        setScheduledRevision(n => n + 1); setSection('popups');
        setPeriod(initialCommunicationPeriod()); sendAttemptRef.current = null;
        syncCommunicationDraft({ ...EMPTY_COMMUNICATION_DRAFT }); setImagePath(null); setSelectedIds(new Set()); setAudienceAll(false);
        return;
      }
      const result = await sendCustomerCommunication({
        title: currentDraft.title,
        body: currentDraft.body,
        imagePath, reminder, sendLocal, requestKey: sendAttemptRef.current!.key,
        targets: selectedClients.map((client) => ({
          id: client.id,
          email: client.email,
          phone: client.phone,
        })),
      });

      if (result.scheduled) {
        showCommunicationNotice("Invio programmato", "La comunicazione partirà alla data e ora scelte. Puoi annullarla in Programmati da inviare.");
        setScheduledRevision(n => n + 1);
        setSection("scheduled");
        syncCommunicationDraft({ ...EMPTY_COMMUNICATION_DRAFT }); setImagePath(null);
        setPeriod(initialCommunicationPeriod());
        setSchedule({ enabled: false, date: initialCommunicationPeriod().from, time: "09:00" });
        setSelectedIds(new Set());
      setAudienceAll(false);
        sendAttemptRef.current = null;
        return;
      }
      if (result.matchedCount === 0) {
        showCommunicationNotice(
          "Nessun destinatario trovato",
          "Aggiorna la rubrica e seleziona nuovamente i destinatari.",
        );
        return;
      }

      const unavailableText =
        result.unavailableCount > 0
          ? ` ${result.unavailableCount} contatti non sono raggiungibili perché non hanno un dispositivo push attivo.`
          : "";
      showCommunicationNotice(
        "Comunicazione inviata",
        `${result.matchedCount} destinatari: comunicazione salvata. ${result.queuedCount} push accodate.${unavailableText}${period.enabled ? " Promemoria giornaliero attivo nel periodo scelto." : ""}`,
      );
      setPeriod(initialCommunicationPeriod());
      sendAttemptRef.current = null;
      syncCommunicationDraft({ ...EMPTY_COMMUNICATION_DRAFT }); setImagePath(null);
      resetQuery();
      setSelectedIds(new Set());
      setAudienceAll(false);
      onClose();
    } catch (error) {
      console.log("Errore invio comunicazione clienti:", error);
      showCommunicationNotice(
        period.enabled ? "Salvataggio non riuscito" : "Invio non riuscito",
        String((error as { message?: string })?.message).includes("invalid_scheduled_send") ? "L’invio deve essere futuro e il periodo del popup non può iniziare prima dell’invio." : String((error as { message?: string })?.message).includes("invalid_reminder_period") ? "Controlla le date: la fine deve essere futura e successiva all’inizio." : "Invio non confermato. Riprova: lo stesso invio non sarà duplicato.",
      );
    } finally {
      sendLockRef.current = false;
      setSending(false);
    }
  };

  return (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={resetAndClose}
    >
      <CustomerSheetFrame {...(Platform.OS !== 'web' ? {onClose: resetAndClose, dismissDisabled: sending || uploadingPoster || savingTemplate || !!deletingTemplateId} : {})}>
        <View style={[styles.card, dockStyle, Platform.OS !== "web" && {flex:1,minHeight:0}, keyboardOpen && {paddingBottom:0}] }>
          <View style={styles.header}>
            <View style={{ marginRight: 12 }}><NativeMedal icon={section==="scheduled"?"time-outline":section==="popups"?"albums-outline":"megaphone-outline"} size={42} iconSize={19} accent={premiumNight?"#B9A3D6":"#6E5590"} /></View>
            <View style={styles.headerText}>
              <Text numberOfLines={2} style={[styles.title,{fontSize:21,lineHeight:26}]}>{section==="scheduled"?"Comunicazioni programmate":section==="popups"?"Popup ai clienti":period.enabled?"Nuovo popup":"Nuova comunicazione"}</Text>
            </View>
            <CustomerPopupClose style={styles.closeButton} onPress={resetAndClose}>
              <Ionicons name="close" size={22} color={premiumColor("#172033","color")} />
            </CustomerPopupClose>
          </View>

          <ScrollView
            ref={contentScrollRef}
            style={{flexShrink:1,minHeight:0, ...(Platform.OS !== "web" ? {flex:1} : {})}}
            onFocus={revealFocusedInput}
            onLayout={revealFocusedInput}
            onScroll={event => { contentOffsetRef.current = event.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={16}
            automaticallyAdjustKeyboardInsets={false}
            keyboardDismissMode={Platform.OS === "web" ? "on-drag" : "none"}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <PremiumChoiceRow style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18, padding: 5, borderRadius: 16, backgroundColor: premiumColor("#EDF2F8","backgroundColor") }}>
              {([
                { key: "compose", label: "Nuova comunicazione", icon: "add-circle-outline" },
                { key: "scheduled", label: "Programmati", icon: "time-outline" },
                { key: "popups", label: "Popup nel periodo", icon: "albums-outline" },
              ] as const).map(tab => <HapticTouchable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: section === tab.key }} onPress={() => setSection(tab.key)} style={{ flexGrow: 1, flexShrink:0, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: section === tab.key ? premiumColor("#253D61","borderColor") : premiumColor("#DCE4EF","borderColor"), backgroundColor: section === tab.key ? premiumColor("#253D61","backgroundColor") : premiumColor("#F9FBFE","backgroundColor") }}>
                <Ionicons name={tab.icon} size={17} color={section === tab.key ? premiumColor("#FFFFFF","color") : premiumColor("#526781","color")} />
                <Text style={{ color: section === tab.key ? premiumColor("#FFFFFF","color") : premiumColor("#526781","color"), fontWeight: "700", fontSize: 12 }}>{tab.label}</Text>
              </HapticTouchable>)}
            </PremiumChoiceRow>
            {section === "scheduled" ? <ScheduledCustomerCommunications revision={scheduledRevision} /> : section === "popups" ? <CustomerCommunicationPopups revision={scheduledRevision} /> : <>
            <PremiumSectionHeader tone={1} style={styles.templateHeader}>
              <Text style={styles.sectionLabel}>Modelli rapidi</Text>
              <Text style={styles.templateHint}>
                {Platform.OS === "web"
                  ? "Tasto destro per modificare o eliminare"
                  : "Tieni premuto per modificare o eliminare"}
              </Text>
            </PremiumSectionHeader>
            <CompactChoiceRow style={styles.templateRow}>
              <HapticTouchable
                style={styles.templateChip}
                onPress={() => applyTemplate(PROMOTION_TEMPLATE)}
              >
                <Ionicons name="pricetag-outline" size={16} color={premiumColor("#6246c7","color")} />
                <Text style={styles.templateText}>Offerta</Text>
              </HapticTouchable>
              <HapticTouchable
                style={styles.templateChip}
                onPress={() => applyTemplate(HOLIDAY_TEMPLATE)}
              >
                <TemplateIconGlyph icon="umbrella" size={17} color={premiumColor("#6246c7","color")} />
                <Text style={styles.templateText}>Ferie</Text>
              </HapticTouchable>
              {savedTemplates.map((template) => (
                <HapticTouchable
                  key={template.id}
                  style={[
                    styles.savedTemplateChip,
                    activeTemplateId === template.id &&
                      styles.savedTemplateChipSelected,
                  ]}
                  onPress={() => applyTemplate(template)}
                  onLongPress={
                    Platform.OS === "web"
                      ? undefined
                      : () => openTemplateActions(template)
                  }
                  delayLongPress={450}
                  longPressHapticType="medium"
                  webContextMenuAction={
                    Platform.OS === "web"
                      ? () => openTemplateActions(template)
                      : undefined
                  }
                  suppressWebContextMenu={Platform.OS === "web"}
                  accessibilityLabel={`Seleziona il modello ${template.title}`}
                >
                  <TemplateIconGlyph
                    icon={template.icon}
                    size={16}
                    color={premiumColor("#285a9d","color")}
                  />
                  <Text style={styles.savedTemplateText} numberOfLines={1}>
                    {template.title}
                  </Text>
                </HapticTouchable>
              ))}
            </CompactChoiceRow>
            {templateActionsTemplate ? (
              <View style={styles.templateManagementRow}>
                <View style={styles.templateManagementCopy}>
                  <Text style={styles.templateManagementLabel}>
                    Modello selezionato
                  </Text>
                  <Text style={styles.templateManagementName}>
                    {templateActionsTemplate.title}
                  </Text>
                </View>
                <HapticTouchable
                  style={[
                    styles.templateManagementButton,
                    editingTemplateId === templateActionsTemplate.id &&
                      styles.templateManagementButtonActive,
                  ]}
                  onPress={() => beginTemplateEditing(templateActionsTemplate)}
                  disabled={!!deletingTemplateId}
                  accessibilityLabel={`Modifica il modello ${templateActionsTemplate.title}`}
                >
                  <Ionicons name="pencil-outline" size={20} color={premiumColor("#5638b8","color")} />
                </HapticTouchable>
                <HapticTouchable
                  style={[
                    styles.templateManagementButton,
                    styles.templateManagementDeleteButton,
                  ]}
                  onPress={() => {
                    setTemplatePendingDelete(templateActionsTemplate);
                    setTemplateActionsTemplateId(null);
                    setEditingTemplateId(null);
                    setTemplateFeedback(null);
                  }}
                  disabled={!!deletingTemplateId}
                  accessibilityLabel={`Elimina il modello ${templateActionsTemplate.title}`}
                >
                  <Ionicons name="trash-outline" size={20} color={premiumColor("#b91c1c","color")} />
                </HapticTouchable>
              </View>
            ) : null}
            {editingTemplateId ? (
              <View style={styles.templateEditingNotice}>
                <Ionicons name="create-outline" size={15} color={premiumColor("#5638b8","color")} />
                <Text style={styles.templateEditingNoticeText}>
                  Modifica titolo, messaggio o icona, poi premi Aggiorna.
                </Text>
              </View>
            ) : null}
            {templatePendingDelete ? (
              <View style={styles.templateDeleteConfirmation}>
                <View style={styles.templateDeleteCopy}>
                  <Text style={styles.templateDeleteTitle}>
                    Eliminare il modello?
                  </Text>
                  <Text style={styles.templateDeleteName} numberOfLines={2}>
                    {templatePendingDelete.title}
                  </Text>
                </View>
                <HapticTouchable
                  style={styles.templateDeleteCancelButton}
                  onPress={() => setTemplatePendingDelete(null)}
                  disabled={!!deletingTemplateId}
                >
                  <Text style={styles.templateDeleteCancelText}>No</Text>
                </HapticTouchable>
                <HapticTouchable
                  style={styles.templateDeleteConfirmButton}
                  onPress={deleteTemplate}
                  disabled={!!deletingTemplateId}
                >
                  <Text style={styles.templateDeleteConfirmText}>
                    {deletingTemplateId ? "Elimino..." : "Elimina"}
                  </Text>
                </HapticTouchable>
              </View>
            ) : null}
            {templatesLoading ? (
              <Text style={styles.templateStatus}>
                Caricamento modelli salvati...
              </Text>
            ) : null}
            {templateFeedback ? (
              <View
                style={[
                  styles.templateFeedback,
                  templateFeedback.tone === "success"
                    ? styles.templateFeedbackSuccess
                    : styles.templateFeedbackError,
                ]}
              >
                <Ionicons
                  name={
                    templateFeedback.tone === "success"
                      ? "checkmark-circle"
                      : "alert-circle"
                  }
                  size={15}
                  color={
                    templateFeedback.tone === "success" ? premiumColor("#15803d","color") : premiumColor("#b91c1c","color")
                  }
                />
                <Text
                  style={[
                    styles.templateFeedbackText,
                    templateFeedback.tone === "success"
                      ? styles.templateFeedbackTextSuccess
                      : styles.templateFeedbackTextError,
                  ]}
                >
                  {templateFeedback.text}
                </Text>
              </View>
            ) : null}

            <PremiumSectionHeader tone={2} style={styles.templateIconHeader}>
              <Text style={styles.sectionLabel}>Icona del modello</Text>
              <Text style={styles.templateIconValue}>
                {
                  TEMPLATE_ICON_OPTIONS.find(
                    (option) => option.key === templateIcon,
                  )?.label
                }
              </Text>
            </PremiumSectionHeader>
            <CompactChoiceRow style={styles.templateIconRow}>
              {TEMPLATE_ICON_OPTIONS.map((option) => {
                const selected = option.key === templateIcon;
                return (
                  <HapticTouchable
                    key={option.key}
                    style={[
                      styles.templateIconButton,
                      selected && styles.templateIconButtonSelected,
                    ]}
                    onPress={() => setTemplateIcon(option.key)}
                    accessibilityLabel={`Icona ${option.label}`}
                    accessibilityState={{ selected }}
                  >
                    <TemplateIconGlyph
                      icon={option.key}
                      size={18}
                      color={selected ? premiumColor("#fff","color") : premiumColor("#5638b8","color")}
                    />
                  </HapticTouchable>
                );
              })}
            </CompactChoiceRow>

            <PremiumChoiceRow style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              {([{ popup: false, label: 'Notifica push' }, { popup: true, label: 'Popup nel periodo' }]).map(mode => <HapticTouchable key={mode.label} disabled={sending} onPress={() => setPeriod(p => ({ ...p, enabled: mode.popup, reuseText: true }))} accessibilityRole="button" accessibilityState={{ selected: period.enabled === mode.popup }} style={{ flexGrow:1, flexShrink:0, minWidth:145, padding: 12, borderRadius: 14, backgroundColor: period.enabled === mode.popup ? premiumColor("#253D61","backgroundColor") : premiumColor("#EFF3F8","backgroundColor") }}><Text style={{ textAlign: 'center', fontWeight: '700', color: period.enabled === mode.popup ? premiumColor("#FFFFFF","color") : premiumColor("#526781","color") }}>{mode.label}</Text></HapticTouchable>)}
            </PremiumChoiceRow>
            <CommunicationDraftFields
              seed={communicationDraftSeed}
              draftRef={communicationDraftRef}
              onValidityChange={handleDraftValidityChange}
            />

            <CommunicationPosterPicker path={imagePath} onChange={setImagePath} disabled={sending} onBusyChange={setUploadingPoster} />

            {!period.enabled && <CommunicationScheduleFields value={schedule} onChange={setSchedule} onPick={openPicker} />}
            {period.enabled && <CommunicationPeriodFields popupOnly value={period} onChange={setPeriod} onPick={openPicker} />}

            <PremiumSectionHeader tone={0} style={styles.recipientHeader}>
              <View>
                <Text style={styles.sectionLabel}>Destinatari</Text>
                <Text style={styles.recipientSummary}>
                  {selectedClients.length} selezionati su{" "}
                  {eligibleClients.length}
                </Text>
              </View>
              <HapticTouchable
                style={styles.selectAllButton}
                onPress={toggleAll}
              >
                <Text style={styles.selectAllText}>
                  {audienceAll ? "Deseleziona tutti" : "Seleziona tutti"}
                </Text>
              </HapticTouchable>
            </PremiumSectionHeader>

            {period.enabled && audienceAll && <Text style={styles.recipientSummary}>Tutti i clienti, anche chi si registrerà durante il periodo.</Text>}
            <DeferredCommunicationQueryInput
              seed={querySeed}
              onCommit={commitQuery}
            />

            <View style={styles.clientList}>
              {visibleClients.map((client) => {
                const selected = selectedIds.has(client.id);
                return (
                  <HapticTouchable
                    key={client.id}
                    style={[
                      styles.clientRow,
                      selected && styles.clientRowSelected,
                    ]}
                    onPress={() => toggleClient(client.id)}
                  >
                    <View
                      style={[styles.check, selected && styles.checkSelected]}
                    >
                      {selected ? (
                        <Ionicons name="checkmark" size={15} color={premiumColor("#fff","color")} />
                      ) : null}
                    </View>
                    <View style={styles.clientText}>
                      <Text style={styles.clientName}>{client.name}</Text>
                      <Text style={styles.clientContact} numberOfLines={1}>
                        {[client.email, client.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                  </HapticTouchable>
                );
              })}
              {visibleClients.length === 0 ? (
                <Text style={styles.emptyText}>
                  Nessun cliente con email o telefono corrisponde alla ricerca.
                </Text>
              ) : null}
            </View>
            </>}
          </ScrollView>

          {section === "compose" && !keyboardOpen && <View {...(Platform.OS==='web'?{dataSet:{communicationsFooter:"true"}}:{})} style={styles.footer}>
            <HapticTouchable
              style={styles.cancelButton}
              onPress={
                editingTemplateId ? cancelTemplateEditing : resetAndClose
              }
              disabled={sending || uploadingPoster || savingTemplate || !!deletingTemplateId}
              accessibilityLabel={
                editingTemplateId ? "Annulla modifica del modello" : "Chiudi"
              }
            >
              <Text {...(Platform.OS==='web'?{dataSet:{communicationActionLabel:"true"}}:{})} style={styles.cancelText}>
                {editingTemplateId ? "Annulla modifica" : "Annulla"}
              </Text>
            </HapticTouchable>
            {!period.enabled && <HapticTouchable
              style={[
                styles.saveButton,
                !canSaveTemplate && styles.actionButtonDisabled,
              ]}
              onPress={saveTemplate}
              disabled={!canSaveTemplate}
              accessibilityLabel="Salva come modello rapido"
            >
              <Ionicons
                {...(Platform.OS==='web'?{dataSet:{communicationActionIcon:"true"}}:{})}
                name={editingTemplateId ? "save" : "save-outline"}
                size={17}
                color={premiumColor("#5638b8","color")}
              />
              <Text {...(Platform.OS==='web'?{dataSet:{communicationActionLabel:"true"}}:{})} style={styles.saveText}>
                {savingTemplate
                  ? editingTemplateId
                    ? "Aggiorno..."
                    : "Salvo..."
                  : editingTemplateId
                    ? "Aggiorna"
                    : "Salva modello"}
              </Text>
            </HapticTouchable>}
            <HapticTouchable
              style={[
                styles.sendButton,
                Platform.OS !== "web" && { minWidth: 0, paddingHorizontal: 10 },
                !canSend && styles.actionButtonDisabled,
              ]}
              onPress={send}
              disabled={!canSend}
            >
              <Ionicons {...(Platform.OS==='web'?{dataSet:{communicationActionIcon:"true"}}:{})} name={period.enabled ? "save-outline" : "paper-plane"} size={17} color={premiumColor("#fff","color")} />
              <Text {...(Platform.OS==='web'?{dataSet:{communicationActionLabel:"true"}}:{})} style={[styles.sendText, Platform.OS !== "web" && { flexShrink: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                {period.enabled ? (sending ? "Salvo…" : "Salva") : sending ? (schedule.enabled ? "Programmo…" : "Invio…") : schedule.enabled ? "Programma" : `Invia a ${selectedClients.length}`}
              </Text>
            </HapticTouchable>
          </View>}
          <NativeDatePickerModal visible={picker?.kind === "date"} title="Scegli la data" initialValue={picker?.initial} onClose={() => setPicker(null)} onConfirm={value => { picker?.confirm(value); setPicker(null); }} embedded />
          <NativeTimePickerModal visible={picker?.kind === "time"} title="Scegli l’orario" initialValue={picker?.initial} onClose={() => setPicker(null)} onConfirm={value => { picker?.confirm(value); setPicker(null); }} embedded />
        </View>
      </CustomerSheetFrame>
    </Modal>
  );
}

const baseCustomerComponentStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    padding: 18,
    justifyContent: "center",
    backgroundColor: "rgba(12, 18, 32, 0.58)",
  },
  card: {
    width: "100%",
    maxWidth: 680,
    maxHeight: "100%",
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 24,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e7e9ef",
  },
  headerText: { flex: 1, paddingRight: 12 },
  eyebrow: {
    color: "#7859d6",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: { marginTop: 3, color: "#172033", fontSize: 22, fontWeight: "800" },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f3f7",
  },
  content: { padding: 22, gap: 10 },
  sectionLabel: { color: "#27324a", fontSize: 13, fontWeight: "800" },
  templateHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  templateHint: {
    flexShrink: 1,
    color: "#7a8497",
    fontSize: 11,
    textAlign: "right",
  },
  templateRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 6,
  },
  templateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: "#f0ebff",
  },
  templateText: { color: "#5638b8", fontSize: 13, fontWeight: "700" },
  savedTemplateChip: {
    maxWidth: "100%",
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#eef4ff",
  },
  savedTemplateChipSelected: {
    backgroundColor: "#dbeafe",
    borderWidth: 1,
    borderColor: "#7da7e8",
  },
  savedTemplateText: {
    flexShrink: 1,
    color: "#285a9d",
    fontSize: 13,
    fontWeight: "700",
  },
  templateManagementRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#cbdcf5",
    backgroundColor: "#f8fbff",
  },
  templateManagementCopy: { flex: 1, minWidth: 0 },
  templateManagementLabel: {
    color: "#64748b",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.45,
  },
  templateManagementName: {
    marginTop: 2,
    color: "#1e3a5f",
    fontSize: 12,
    fontWeight: "800",
  },
  templateManagementButton: {
    width: 40,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d8cdf5",
    backgroundColor: "#f6f3ff",
  },
  templateManagementButtonActive: {
    borderColor: "#8d73df",
    backgroundColor: "#eee8ff",
  },
  templateManagementDeleteButton: {
    borderColor: "#fecaca",
    backgroundColor: "#fff5f5",
  },
  templateEditingNotice: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#f6f3ff",
    borderWidth: 1,
    borderColor: "#d8cdf5",
  },
  templateEditingNoticeText: {
    flex: 1,
    color: "#5638b8",
    fontSize: 12,
    fontWeight: "700",
  },
  templateDeleteConfirmation: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff7f7",
  },
  templateDeleteCopy: { flex: 1, minWidth: 0 },
  templateDeleteTitle: { color: "#991b1b", fontSize: 12, fontWeight: "800" },
  templateDeleteName: { marginTop: 2, color: "#7f1d1d", fontSize: 11 },
  templateDeleteCancelButton: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  templateDeleteCancelText: {
    color: "#7f1d1d",
    fontSize: 12,
    fontWeight: "800",
  },
  templateDeleteConfirmButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#b91c1c",
  },
  templateDeleteConfirmText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  templateStatus: { color: "#7a8497", fontSize: 12 },
  templateFeedback: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  templateFeedbackSuccess: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
  },
  templateFeedbackError: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  templateFeedbackText: { flex: 1, fontSize: 12, fontWeight: "700" },
  templateFeedbackTextSuccess: { color: "#15803d" },
  templateFeedbackTextError: { color: "#b91c1c" },
  templateIconHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  templateIconValue: { color: "#5638b8", fontSize: 11, fontWeight: "800" },
  templateIconRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  templateIconButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#d8cdf5",
    backgroundColor: "#f6f3ff",
  },
  templateIconButtonSelected: {
    borderColor: "#6f54cb",
    backgroundColor: "#6f54cb",
  },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: "#dfe3eb",
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: "#172033",
    backgroundColor: "#fafbfc",
    fontSize: 15,
  },
  messageInput: { minHeight: 112 },
  labelRow: {
    marginTop: 4,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  counter: { color: "#7a8497", fontSize: 12 },
  recipientHeader: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  recipientSummary: { marginTop: 2, color: "#7a8497", fontSize: 12 },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#eef4ff",
  },
  selectAllText: { color: "#285a9d", fontSize: 12, fontWeight: "800" },
  clientList: { gap: 8, marginTop: 2 },
  clientRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e4e7ed",
    borderRadius: 13,
  },
  clientRowSelected: { borderColor: "#8d73df", backgroundColor: "#f7f4ff" },
  check: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "#a8b0bf",
    alignItems: "center",
    justifyContent: "center",
  },
  checkSelected: { borderColor: "#7155cf", backgroundColor: "#7155cf" },
  clientText: { flex: 1 },
  clientName: { color: "#1d273b", fontSize: 14, fontWeight: "700" },
  clientContact: { marginTop: 2, color: "#768095", fontSize: 12 },
  emptyText: {
    paddingVertical: 18,
    textAlign: "center",
    color: "#768095",
    fontSize: 13,
  },
  footer: {
    padding: 16,
    flexDirection: "row",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e7e9ef",
  },
  cancelButton: {
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eef0f4",
  },
  cancelText: { color: "#35405a", fontSize: 14, fontWeight: "800" },
  saveButton: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#cfc3f4",
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6f3ff",
  },
  saveText: { color: "#5638b8", fontSize: 14, fontWeight: "800" },
  sendButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6f54cb",
  },
  actionButtonDisabled: { opacity: 0.45 },
  sendText: { color: "#fff", fontSize: 14, fontWeight: "800" },
});


