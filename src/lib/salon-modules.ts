import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

export type SalonModuleKey =
  | 'index'
  | 'agenda'
  | 'prenotazioni'
  | 'clienti'
  | 'cassa'
  | 'servizi';

type ModuleIconName = ComponentProps<typeof Ionicons>['name'];

type SalonModuleConfig = {
  icon: {
    active: ModuleIconName;
    inactive: ModuleIconName;
  };
  iconOpticalOffset?: {
    x?: number;
    y?: number;
  };
  accent: {
    background: string;
    border: string;
    text: string;
  };
};

export const SALON_MODULES: Record<SalonModuleKey, SalonModuleConfig> = {
  index: {
    icon: {
      active: 'home',
      inactive: 'home-outline',
    },
    iconOpticalOffset: {
      x: 0.8,
      y: -0.6,
    },
    accent: {
      background: '#dbeafe',
      border: '#93c5fd',
      text: '#1d4ed8',
    },
  },
  agenda: {
    icon: {
      active: 'calendar',
      inactive: 'calendar-outline',
    },
    iconOpticalOffset: {
      x: 0.2,
      y: -0.4,
    },
    accent: {
      background: '#dcfce7',
      border: '#86efac',
      text: '#166534',
    },
  },
  prenotazioni: {
    icon: {
      active: 'notifications',
      inactive: 'notifications-outline',
    },
    iconOpticalOffset: {
      x: 0.4,
      y: -1,
    },
    accent: {
      background: '#fee2e2',
      border: '#fca5a5',
      text: '#b91c1c',
    },
  },
  clienti: {
    icon: {
      active: 'people',
      inactive: 'people-outline',
    },
    iconOpticalOffset: {
      x: 0.3,
      y: -0.4,
    },
    accent: {
      background: '#ede9fe',
      border: '#c4b5fd',
      text: '#6d28d9',
    },
  },
  cassa: {
    icon: {
      active: 'card',
      inactive: 'card-outline',
    },
    iconOpticalOffset: {
      x: 0.3,
      y: -0.2,
    },
    accent: {
      background: '#fef3c7',
      border: '#fcd34d',
      text: '#b45309',
    },
  },
  servizi: {
    icon: {
      active: 'cut',
      inactive: 'cut-outline',
    },
    iconOpticalOffset: {
      x: 1,
      y: -0.5,
    },
    accent: {
      background: '#fce7f3',
      border: '#f9a8d4',
      text: '#be185d',
    },
  },
};
