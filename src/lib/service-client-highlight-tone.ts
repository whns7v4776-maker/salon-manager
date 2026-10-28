import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { lowerItalian } from './italian-case';

type ServiceClientHighlightTone = {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  icon: ComponentProps<typeof Ionicons>['name'];
};

const SERVICE_CLIENT_HIGHLIGHT_CUSTOM_TONES = [
  { backgroundColor: '#1E3A8A', borderColor: '#93C5FD', iconColor: '#FDE68A' },
  { backgroundColor: '#166534', borderColor: '#86EFAC', iconColor: '#FDE68A' },
  { backgroundColor: '#5B21B6', borderColor: '#C4B5FD', iconColor: '#FDE68A' },
  { backgroundColor: '#0F766E', borderColor: '#5EEAD4', iconColor: '#FDE68A' },
  { backgroundColor: '#9F1239', borderColor: '#FDA4AF', iconColor: '#FDE68A' },
] as const;

export const resolveServiceClientHighlightTone = (
  label: string,
): ServiceClientHighlightTone => {
  const normalized = lowerItalian(label.trim());

  if (/scaden|tempo limitato|solo oggi/.test(normalized)) {
    return {
      backgroundColor: '#7F1D1D',
      borderColor: '#FCA5A5',
      iconColor: '#FDE68A',
      icon: 'time',
    };
  }
  if (/richiest|più scelto|piu scelto|popolar|\btop\b/.test(normalized)) {
    return {
      backgroundColor: '#1E3A8A',
      borderColor: '#93C5FD',
      iconColor: '#FDE68A',
      icon: 'flame',
    };
  }
  if (/convenient|sconto|offerta|promo|prezzo/.test(normalized)) {
    return {
      backgroundColor: '#166534',
      borderColor: '#86EFAC',
      iconColor: '#FDE68A',
      icon: 'pricetag',
    };
  }
  if (/consigli|raccomand|ideale/.test(normalized)) {
    return {
      backgroundColor: '#5B21B6',
      borderColor: '#C4B5FD',
      iconColor: '#FDE68A',
      icon: 'thumbs-up',
    };
  }
  if (/novit|nuov|appena arriv/.test(normalized)) {
    return {
      backgroundColor: '#0F766E',
      borderColor: '#5EEAD4',
      iconColor: '#FDE68A',
      icon: 'sparkles',
    };
  }
  if (/premium|lusso|esclusiv/.test(normalized)) {
    return {
      backgroundColor: '#111827',
      borderColor: '#F8D477',
      iconColor: '#F8D477',
      icon: 'diamond',
    };
  }

  const icon: ServiceClientHighlightTone['icon'] = /regal|omaggio/.test(normalized)
    ? 'gift'
    : /rapid|veloce|express/.test(normalized)
      ? 'flash'
      : /relax|benessere|natur/.test(normalized)
        ? 'leaf'
        : /preferit|amato|cuore/.test(normalized)
          ? 'heart'
          : 'ribbon';
  const colorIndex = Array.from(normalized).reduce(
    (total, character) => total + (character.codePointAt(0) ?? 0),
    0,
  ) % SERVICE_CLIENT_HIGHLIGHT_CUSTOM_TONES.length;
  return {
    ...SERVICE_CLIENT_HIGHLIGHT_CUSTOM_TONES[colorIndex],
    icon,
  };
};
