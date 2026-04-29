import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    useWindowDimensions,
    View,
} from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';
import { SafeAreaView } from 'react-native-safe-area-context';

const IS_ANDROID = Platform.OS === 'android';
const ANDROID_TEXT_BREATHING_ROOM = IS_ANDROID ? 8 : 0;

type OnboardingStep = {
  key: string;
  title: string;
  body: string;
  cta: string;
  visual: 'welcome' | 'services' | 'qr' | 'agenda' | 'speed' | 'final';
};

type OnboardingModalProps = {
  visible: boolean;
  onClose: () => void;
  onComplete: () => void;
};

const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: 'welcome',
    title: 'Gestisci il tuo salone in modo semplice',
    body: 'Clienti, servizi e appuntamenti. Tutto in un unico posto, sempre sotto controllo.',
    cta: 'Inizia',
    visual: 'welcome',
  },
  {
    key: 'services',
    title: 'Organizza servizi e clienti',
    body: 'Aggiungi e modifica servizi in pochi secondi. Gestisci i clienti facilmente e tieni tutto aggiornato.',
    cta: 'Avanti',
    visual: 'services',
  },
  {
    key: 'qr',
    title: 'Fai prenotare i clienti in autonomia',
    body: 'Condividi il tuo QR code. I clienti accedono direttamente al tuo salone e prenotano in modo semplice.',
    cta: 'Avanti',
    visual: 'qr',
  },
  {
    key: 'agenda',
    title: 'Controlla la tua giornata',
    body: 'Visualizza appuntamenti e disponibilita. Organizza il lavoro in modo chiaro e veloce.',
    cta: 'Avanti',
    visual: 'agenda',
  },
  {
    key: 'speed',
    title: 'Tutto a portata di tap',
    body: 'Crea appuntamenti, gestisci clienti e accedi alle funzioni principali in pochi passaggi.',
    cta: 'Avanti',
    visual: 'speed',
  },
  {
    key: 'final',
    title: 'Sei pronto',
    body: 'Inizia a usare il gestionale e semplifica il lavoro ogni giorno.',
    cta: 'Entra nell’app',
    visual: 'final',
  },
];

function StepVisual({
  visual,
  compact,
}: {
  visual: OnboardingStep['visual'];
  compact: boolean;
}) {
  const shellStyle = compact ? styles.visualShellCompact : styles.visualShell;

  if (visual === 'welcome') {
    return (
      <View style={shellStyle}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark} />
          <View style={styles.brandTextWrap}>
            <Text style={styles.brandEyebrow}>SALON MANAGER</Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.brandTitle}
            >
              Il tuo salone, ordinato.
            </Text>
          </View>
        </View>
        <View style={styles.featureChipRow}>
          <View style={styles.featureChip}>
            <Ionicons name="people-outline" size={15} color="#e2e8f0" />
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.featureChipText}
            >
              Clienti
            </Text>
          </View>
          <View style={styles.featureChip}>
            <Ionicons name="cut-outline" size={15} color="#e2e8f0" />
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.featureChipText}
            >
              Servizi
            </Text>
          </View>
          <View style={styles.featureChip}>
            <Ionicons name="calendar-outline" size={15} color="#e2e8f0" />
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.featureChipText}
            >
              Agenda
            </Text>
          </View>
        </View>
      </View>
    );
  }

  if (visual === 'services') {
    return (
      <View style={shellStyle}>
        <View style={styles.dualPanelRow}>
          <View style={styles.softPanel}>
            <Text style={styles.panelTitle}>Servizi</Text>
            <View style={styles.listLineRow}>
              <View style={styles.lineWide} />
              <View style={styles.pricePill}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={styles.pricePillText}
                >
                  €35
                </Text>
              </View>
            </View>
            <View style={styles.listLineRow}>
              <View style={styles.lineMid} />
              <View style={styles.pricePill}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={styles.pricePillText}
                >
                  €60
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.softPanelAccent}>
            <Text style={styles.panelTitle}>Clienti</Text>
            <View style={styles.personRow}>
              <View style={styles.personAvatar} />
              <View style={styles.personLines}>
                <View style={styles.lineWide} />
                <View style={styles.lineShort} />
              </View>
            </View>
            <View style={styles.personRow}>
              <View style={styles.personAvatarMuted} />
              <View style={styles.personLines}>
                <View style={styles.lineMid} />
                <View style={styles.lineShort} />
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (visual === 'qr') {
    return (
      <View style={[shellStyle, styles.visualShellCentered]}>
        <View style={[styles.qrCard, compact && styles.qrCardCompact]}>
          <View style={[styles.qrGrid, compact && styles.qrGridCompact]}>
            {Array.from({ length: 25 }, (_, index) => (
              <View
                key={`qr-${index}`}
                style={[styles.qrCell, index % 2 === 0 && styles.qrCellFilled]}
              />
            ))}
          </View>
        </View>
        <View style={[styles.qrCaptionChip, compact && styles.qrCaptionChipCompact]}>
          <Ionicons name="phone-portrait-outline" size={18} color="#f8fafc" />
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={styles.qrCaptionText}
            >
              Accesso immediato via QR
            </Text>
        </View>
      </View>
    );
  }

  if (visual === 'agenda') {
    return (
      <View style={[shellStyle, compact && styles.agendaShellCompact]}>
        <View style={[styles.agendaHeaderRow, compact && styles.agendaHeaderRowCompact]}>
          <Text style={styles.panelTitle}>Agenda</Text>
          <View style={[styles.agendaBadge, compact && styles.agendaBadgeCompact]}>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.agendaBadgeText}
            >
              Oggi
            </Text>
          </View>
        </View>
        <View style={[styles.agendaGrid, compact && styles.agendaGridCompact]}>
          <View style={[styles.timeRail, compact && styles.timeRailCompact]}>
            <Text style={styles.timeText}>09:00</Text>
            <Text style={styles.timeText}>10:00</Text>
            <Text style={styles.timeText}>11:00</Text>
          </View>
          <View style={[styles.agendaColumn, compact && styles.agendaColumnCompact]}>
            <View style={[styles.blockTall, compact && styles.blockTallCompact]} />
            <View style={[styles.freeSlot, compact && styles.freeSlotCompact]} />
            <View style={[styles.blockSmall, compact && styles.blockSmallCompact]} />
          </View>
          <View style={[styles.agendaColumn, compact && styles.agendaColumnCompact]}>
            <View style={[styles.freeSlot, compact && styles.freeSlotCompact]} />
            <View style={[styles.blockWide, compact && styles.blockWideCompact]} />
            <View style={[styles.freeSlot, compact && styles.freeSlotCompact]} />
          </View>
        </View>
      </View>
    );
  }

  if (visual === 'speed') {
    return (
      <View style={[shellStyle, styles.visualShellCentered]}>
        <View style={styles.speedCore}>
          <Ionicons name="flash-outline" size={28} color="#ffffff" />
        </View>
        <View style={styles.speedPillRow}>
          <View style={styles.speedPill}>
            <Ionicons name="add-circle-outline" size={15} color="#f8fafc" />
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={styles.speedPillText}
            >
              Appuntamenti
            </Text>
          </View>
          <View style={styles.speedPill}>
            <Ionicons name="people-outline" size={15} color="#f8fafc" />
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.speedPillText}
            >
              Clienti
            </Text>
          </View>
          <View style={styles.speedPill}>
            <Ionicons name="qr-code-outline" size={15} color="#f8fafc" />
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={styles.speedPillText}
            >
              QR
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[shellStyle, styles.visualShellCentered]}>
      <View style={styles.finalBadge}>
        <Ionicons name="checkmark" size={30} color="#ffffff" />
      </View>
      <Text style={styles.finalText}>Pronto a lavorare meglio</Text>
    </View>
  );
}

export function OnboardingModal({ visible, onClose, onComplete }: OnboardingModalProps) {
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);

  const isCompactHeight = height < 760;
  const cardMaxWidth = Math.min(width - 28, 560);
  const cardFixedHeight = Math.min(height * (isCompactHeight ? 0.68 : 0.72), isCompactHeight ? 500 : 600);
  const overlayTop = isCompactHeight ? 58 : 64;
  const popupTopOffset = isCompactHeight ? 76 : 82;
  const currentStep = ONBOARDING_STEPS[currentIndex];
  const progressLabel = `${currentIndex + 1} / ${ONBOARDING_STEPS.length}`;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(0);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const handleNext = () => {
    if (currentIndex >= ONBOARDING_STEPS.length - 1) {
      onComplete();
      return;
    }

    setCurrentIndex((previous) => Math.min(previous + 1, ONBOARDING_STEPS.length - 1));
  };

  return (
    <View style={styles.modalRoot}>
      <View style={styles.scrim} />
      <View pointerEvents="none" style={styles.scrimVignetteTop} />
      <View pointerEvents="none" style={styles.scrimVignetteBottom} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        <View style={[styles.overlayHeader, { top: overlayTop }]}>
          <View style={styles.overlayBadge}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.overlayBadgeText}>Onboarding</Text>
          </View>
          <HapticTouchable
            style={styles.skipButton}
            onPress={onClose}
            hapticType="light"
            pressInHapticType="light"
            activeOpacity={0.9}
          >
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.skipText}>Salta</Text>
          </HapticTouchable>
        </View>

        <View
          style={[
            styles.centerLayer,
            {
              paddingTop: popupTopOffset,
              paddingBottom: isCompactHeight ? 34 : 40,
            },
          ]}
        >
          <View
            style={[
              styles.cardShell,
              {
                maxWidth: cardMaxWidth,
                height: cardFixedHeight,
              },
            ]}
          >
            <View style={styles.cardTint} />

            <ScrollView
              style={styles.cardScroll}
              contentContainerStyle={styles.cardScrollContent}
              showsVerticalScrollIndicator={false}
              bounces={false}
              scrollEnabled={false}
            >
              <View style={styles.cardAccent} />
              <View style={[styles.visualWrap, isCompactHeight && styles.visualWrapCompact]}>
                <StepVisual visual={currentStep.visual} compact={isCompactHeight} />
              </View>

              <View style={styles.copyBlock}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.progressText}>Step {progressLabel}</Text>
                <Text numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.72} style={[styles.title, isCompactHeight && styles.titleCompact]}>
                  {currentStep.title}
                </Text>
                <Text numberOfLines={4} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.body, isCompactHeight && styles.bodyCompact]}>
                  {currentStep.body}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <View pointerEvents="none" style={styles.dotsRow}>
                {ONBOARDING_STEPS.map((step, index) => (
                  <View
                    key={step.key}
                    style={styles.dotButton}
                  >
                    <View style={[styles.dot, index === currentIndex && styles.dotActive]} />
                  </View>
                ))}
              </View>

              <HapticTouchable
                style={styles.primaryButton}
                onPress={handleNext}
                hapticType="medium"
                pressInHapticType="light"
                activeOpacity={0.92}
              >
                <Text
                  numberOfLines={1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  style={styles.primaryButtonText}
                >
                  {currentStep.cta}
                </Text>
              </HapticTouchable>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 9999,
    elevation: 9999,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 12, 22, 0.82)',
  },
  scrimVignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '38%',
    backgroundColor: 'rgba(7, 12, 22, 0.14)',
  },
  scrimVignetteBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '32%',
    backgroundColor: 'rgba(7, 12, 22, 0.18)',
  },
  safeArea: {
    flex: 1,
    position: 'relative',
  },
  overlayHeader: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 0,
  },
  overlayBadge: {
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 14 : 12,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  overlayBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#f8fafc',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  skipButton: {
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 16 : 14,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f8fafc',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  centerLayer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 14,
  },
  cardShell: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: '#020617',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244, 248, 252, 0.9)',
  },
  cardScroll: {
    flex: 1,
  },
  cardScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardAccent: {
    width: 44,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: 'rgba(71, 85, 105, 0.28)',
    marginBottom: 10,
  },
  visualWrap: {
    height: 214,
    marginBottom: 16,
  },
  visualWrapCompact: {
    height: 188,
    marginBottom: 12,
  },
  copyBlock: {
    alignItems: 'center',
    paddingTop: 6,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  title: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  titleCompact: {
    fontSize: 23,
    lineHeight: 28,
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
    maxWidth: 420,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  dotButton: {
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(100, 116, 139, 0.32)',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#0f172a',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#111827',
    paddingHorizontal: IS_ANDROID ? 16 : 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  visualShell: {
    flex: 1,
    borderRadius: 24,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
    justifyContent: 'space-between',
  },
  visualShellCompact: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
    justifyContent: 'space-between',
  },
  visualShellCentered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 14,
  },
  brandMark: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#c78b24',
    marginRight: 12,
  },
  brandTextWrap: {
    flex: 1,
  },
  brandEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#f7d58d',
    marginBottom: 4,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#f8fafc',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  featureChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 8,
  },
  featureChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#e2e8f0',
    paddingRight: ANDROID_TEXT_BREATHING_ROOM,
  },
  dualPanelRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 10,
  },
  softPanel: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 12,
  },
  softPanelAccent: {
    flex: 1,
    backgroundColor: 'rgba(22, 101, 52, 0.14)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(187, 247, 208, 0.14)',
    padding: 12,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#f8fafc',
    marginBottom: 10,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  listLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  lineWide: {
    flex: 1,
    height: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(203, 213, 225, 0.78)',
  },
  lineMid: {
    width: '68%',
    height: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.9)',
  },
  lineShort: {
    width: '42%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(203, 213, 225, 0.78)',
    marginTop: 6,
  },
  pricePill: {
    borderRadius: 999,
    backgroundColor: 'rgba(239, 246, 255, 0.94)',
    paddingHorizontal: IS_ANDROID ? 12 : 8,
    paddingVertical: 5,
  },
  pricePillText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1d4ed8',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  personAvatar: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  personAvatarMuted: {
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: '#bbf7d0',
  },
  personLines: {
    flex: 1,
  },
  qrCard: {
    width: 124,
    height: 124,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  qrCardCompact: {
    width: 98,
    height: 98,
    borderRadius: 18,
    padding: 8,
    marginBottom: 8,
  },
  qrGrid: {
    width: 88,
    height: 88,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  qrGridCompact: {
    width: 70,
    height: 70,
  },
  qrCell: {
    width: '20%',
    height: '20%',
    backgroundColor: '#dbe2ea',
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  qrCellFilled: {
    backgroundColor: '#111827',
  },
  qrCaptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: IS_ANDROID ? 16 : 12,
    paddingVertical: 8,
  },
  qrCaptionChipCompact: {
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 6,
  },
  qrCaptionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f8fafc',
    paddingRight: ANDROID_TEXT_BREATHING_ROOM,
  },
  agendaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  agendaShellCompact: {
    padding: 10,
  },
  agendaHeaderRowCompact: {
    marginBottom: 8,
  },
  agendaBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 6,
  },
  agendaBadgeCompact: {
    paddingHorizontal: IS_ANDROID ? 12 : 8,
    paddingVertical: 4,
  },
  agendaBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#f8fafc',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  agendaGrid: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  agendaGridCompact: {
    gap: 6,
  },
  timeRail: {
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  timeRailCompact: {
    paddingVertical: 2,
  },
  timeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#cbd5e1',
    paddingRight: ANDROID_TEXT_BREATHING_ROOM,
  },
  agendaColumn: {
    flex: 1,
    gap: 8,
  },
  agendaColumnCompact: {
    gap: 6,
  },
  blockTall: {
    height: 64,
    borderRadius: 14,
    backgroundColor: '#deecff',
    borderWidth: 1,
    borderColor: '#bfd8ff',
  },
  blockTallCompact: {
    height: 48,
    borderRadius: 12,
  },
  blockSmall: {
    height: 34,
    borderRadius: 14,
    backgroundColor: '#fee7e7',
    borderWidth: 1,
    borderColor: '#f7bcbc',
  },
  blockSmallCompact: {
    height: 24,
    borderRadius: 12,
  },
  blockWide: {
    height: 50,
    borderRadius: 14,
    backgroundColor: '#e3f7e9',
    borderWidth: 1,
    borderColor: '#bbe7c8',
  },
  blockWideCompact: {
    height: 38,
    borderRadius: 12,
  },
  freeSlot: {
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  freeSlotCompact: {
    height: 20,
    borderRadius: 12,
  },
  speedCore: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  speedPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  speedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 8,
  },
  speedPillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#f8fafc',
    paddingRight: ANDROID_TEXT_BREATHING_ROOM,
  },
  finalBadge: {
    width: 86,
    height: 86,
    borderRadius: 28,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  finalText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#f8fafc',
    textAlign: 'center',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
});
