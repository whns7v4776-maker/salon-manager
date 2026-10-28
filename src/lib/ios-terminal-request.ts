type TerminalResponse = {data: any; error: any};
type TerminalInvoke = (body: Record<string, unknown>, options: {signal: AbortSignal; timeout: number}) => Promise<TerminalResponse>;

export async function waitForTapResult<T>(pending: Promise<T>, timeout: number, message: string, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { onTimeout?.(); reject(Error(message)); }, timeout);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Functions' fetch timeout cannot interrupt a pending authentication lookup or
// response-body decoding. Bound the complete invocation, including both, and
// abort its fetch so a delayed auth result cannot send a stale request later.
export async function callIosTerminal(invoke: TerminalInvoke, action: string, extra: Record<string, unknown> = {}, timeout = 30000) {
  const abort = new AbortController();
  const message = action === 'terminal-status' || action === 'terminal-token'
    ? 'La verifica di Tap to Pay non risponde. Controlla la connessione e riprova.'
    : 'Connessione interrotta. Verifica il pagamento prima di riprovare.';
  const pending = (async () => {
    const {data, error} = await invoke({action, ...extra}, {signal: abort.signal, timeout});
    if (error || data?.error) {
      let detail = data?.error;
      if (!detail && error?.context?.json) try { detail = (await error.context.json()).error; } catch {}
      throw Error(typeof detail === 'string' ? detail : message);
    }
    if (!data || typeof data !== 'object') throw Error(message);
    return data;
  })();
  return waitForTapResult(pending, timeout, message, () => abort.abort());
}
