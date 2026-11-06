import { useEffect, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import Constants from 'expo-constants';
import { callCashStripe, rememberCashStripeStatus } from '../../components/cash-stripe-panel';

export type QuickCheckout = 'terminal' | 'checkout' | 'cash';
type Readiness = { stripe: boolean; tapToPay: boolean };

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: Readiness }>();
const inflight = new Map<string, Promise<Readiness>>();

export const tapToPayDeviceCapable = () =>
  Platform.OS === 'ios' && Constants.expoConfig?.extra?.terminalBuildEnabled === true && !!NativeModules.StripeTerminalReactNative;

async function loadReadiness(workspaceId: string): Promise<Readiness> {
  const capable = tapToPayDeviceCapable();
  // Started together and shared with the checkout panel: tapping Tap to Pay
  // then opens the reader without repeating these two server checks.
  const terminalRequest = capable ? callCashStripe('terminal-status') : null;
  terminalRequest?.catch(() => {});
  const status = await callCashStripe('status');
  const stripe = status?.ready === true;
  rememberCashStripeStatus(workspaceId, status);
  if (!stripe || !terminalRequest) return { stripe, tapToPay: false };
  try {
    const terminal = await terminalRequest;
    rememberCashStripeStatus(workspaceId, status, terminal);
    return { stripe, tapToPay: terminal?.enabled === true && !!terminal.locations?.length };
  } catch {
    return { stripe, tapToPay: false };
  }
}

// The fastest way to get paid for this salon, checked once and cached for a few minutes:
// Tap to Pay when the reader is usable, otherwise QR / link when Stripe is ready, otherwise cash.
// `null` while the first check is running, so callers can keep their neutral layout meanwhile.
export function useQuickCheckout(workspaceId: string): { quick: QuickCheckout | null; stripe: boolean; tapToPay: boolean } {
  const fresh = cache.get(workspaceId);
  const [value, setValue] = useState<Readiness | null>(fresh && Date.now() - fresh.at < CACHE_MS ? fresh.value : null);
  useEffect(() => {
    const cached = cache.get(workspaceId);
    if (cached && Date.now() - cached.at < CACHE_MS) { setValue(cached.value); return; }
    let current = true;
    let job = inflight.get(workspaceId);
    if (!job) {
      job = loadReadiness(workspaceId).catch(() => ({ stripe: false, tapToPay: false }));
      inflight.set(workspaceId, job);
      void job.then(next => { cache.set(workspaceId, { at: Date.now(), value: next }); inflight.delete(workspaceId); });
    }
    void job.then(next => { if (current) setValue(next); });
    return () => { current = false; };
  }, [workspaceId]);
  if (!value) return { quick: null, stripe: false, tapToPay: false };
  return { quick: value.tapToPay ? 'terminal' : value.stripe ? 'checkout' : 'cash', stripe: value.stripe, tapToPay: value.tapToPay };
}
