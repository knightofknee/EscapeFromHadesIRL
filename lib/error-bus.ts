// Tiny pub/sub so any layer — React contexts, hooks, or plain lib modules
// (which can't use React context) — can surface a user-visible error without
// coupling to the UI. The ErrorToast component (mounted once at the root)
// subscribes and renders the banner; producers just call emitError().

export type AppError = {
  message: string;
  /** Optional retry action shown as a button on the toast. */
  retry?: () => void;
};

type Listener = (err: AppError) => void;

let listeners: Listener[] = [];

/** Report a user-facing error. No-ops gracefully if nothing is mounted yet. */
export function emitError(message: string, retry?: () => void): void {
  const err: AppError = { message, retry };
  for (const l of listeners) {
    try {
      l(err);
    } catch {
      // a bad subscriber must not break the producer
    }
  }
}

export function subscribeErrors(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
