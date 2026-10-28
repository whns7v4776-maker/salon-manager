export type ClientNotificationAction = 'call' | 'whatsapp' | 'cancel';

/** Neutral surfaces, with restrained semantic accents on icons and feedback. */
export function clientNotificationActionColors(night: boolean, action: ClientNotificationAction) {
  const colors = night ? {
    call: { fill: '#252B2D', ink: '#F1EEE7', icon: '#A5C5D6', border: '#4A5255', hover: '#2C3338', hoverBorder: '#7F9EAE' },
    whatsapp: { fill: '#252B2D', ink: '#F1EEE7', icon: '#A7C9B1', border: '#4A5255', hover: '#2D3530', hoverBorder: '#7E9E88' },
    cancel: { fill: '#252B2D', ink: '#D6A9B2', icon: '#D6A9B2', border: '#71535B', hover: '#363034', hoverBorder: '#AE818A' },
  } : {
    call: { fill: '#F6F6F3', ink: '#262725', icon: '#496C80', border: '#D7D8D2', hover: '#EAF0F2', hoverBorder: '#8AA6B5' },
    whatsapp: { fill: '#F6F6F3', ink: '#262725', icon: '#4E7659', border: '#D7D8D2', hover: '#EAF0EA', hoverBorder: '#93AE99' },
    cancel: { fill: '#F6F6F3', ink: '#8A5260', icon: '#8A5260', border: '#DAC5CB', hover: '#F2EAEC', hoverBorder: '#B88F9A' },
  };
  return colors[action];
}

/** Scoped feedback overrides the generic brown hover wash, never card borders. */
export function clientNotificationActionCss(night: boolean) {
  const target = 'html body [data-client-notification-action]';
  const enabled = ':not(:disabled):not([aria-disabled="true"])';
  return `
    ${target} { transition: background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
    @media (hover:hover) and (pointer:fine) {
      ${target}${enabled}:hover { outline:none!important; filter:none!important; box-shadow:inset 0 1px 0 rgba(255,255,255,.30)!important; }
      ${(['call', 'whatsapp', 'cancel'] as const).map(action => {
        const c = clientNotificationActionColors(night, action);
        return `html body [data-client-notification-action="${action}"]${enabled}:hover { background-color:${c.hover}!important; border-color:${c.hoverBorder}!important; }`;
      }).join('\n')}
    }
    ${target}:focus-visible { outline:2px solid ${night ? '#F1EEE7' : '#343735'}!important; outline-offset:3px; filter:none!important; box-shadow:none!important; }
    @media (prefers-reduced-motion:reduce) { ${target} { transition:none; } }
  `;
}
