import { useAccessAppearance } from '../access-premium';
import React, { useState } from 'react';
import { Platform } from 'react-native';

/** Browser-owned date/time UI. Mobile never mounts a DOM element. */
export function BrowserDateTimeInput({ mode, label, value, minimum, onChange }: {
  mode: 'date' | 'time'; label: string; value: string; minimum?: string;
  onChange: (value: string) => void;
}) {
  const {palette:p}=useAccessAppearance();
  const [focused, setFocused] = useState(false);
  if (Platform.OS !== 'web') return null;
  const input = React.createElement('input', {
    className: 'salon-web-date-time',
    type: mode, 'aria-label': label, value, min: minimum, required: true,
    step: mode === 'time' ? 60 : undefined,
    onFocus: () => setFocused(true), onBlur: () => setFocused(false),
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.value && event.target.validity.valid) onChange(event.target.value);
    },
    style: { boxSizing: 'border-box', width: '100%', minWidth: 0, minHeight: 56,
      padding: '12px 16px', marginBottom: 16, border: `2px solid ${focused?p.muted:p.line}`,
      borderRadius: 16, background:p.field, color:p.ink, outline: 'none', fontSize:'clamp(20px,5vw,26px)', fontWeight: 650, textAlign: 'center', fontVariantNumeric: 'tabular-nums',
      fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', colorScheme:p.night?'dark':'light' },
  });
  return React.createElement(React.Fragment, null,
    React.createElement('style', null, `
      .salon-web-date-time::-webkit-date-and-time-value { text-align: center; font: inherit; }
      .salon-web-date-time::-webkit-datetime-edit { width: 100%; display: inline-flex; justify-content: center; padding: 0; font: inherit; }
      .salon-web-date-time::-webkit-datetime-edit-fields-wrapper { padding: 0; font: inherit; }
      .salon-web-date-time::-webkit-datetime-edit-text,
      .salon-web-date-time::-webkit-datetime-edit-day-field,
      .salon-web-date-time::-webkit-datetime-edit-month-field,
      .salon-web-date-time::-webkit-datetime-edit-year-field,
      .salon-web-date-time::-webkit-datetime-edit-hour-field,
      .salon-web-date-time::-webkit-datetime-edit-minute-field { font: inherit; }
    `), input);
}

