import {
  onSnapshot,
  type DocumentReference,
  type FirestoreError,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';

type FirestoreRef = Query<any> | DocumentReference<any>;

interface OfflineCallbacks {
  onError?: (error: FirestoreError) => void;
  setOffline: (offline: boolean) => void;
}

interface OfflineOptions {
  offlineTimeoutMs?: number;
  offlineGraceMs?: number;
}

const RETRY_INITIAL_MS = 2000;
const RETRY_MAX_MS = 30_000;

/**
 * Wraps `onSnapshot` with offline-aware tracking so callers can show
 * "No internet" rather than "No data yet" when an empty result is the
 * product of a failed call.
 *
 * `setOffline(true)` fires when (a) we've waited longer than
 * `offlineTimeoutMs` without a server snapshot, (b) we'd previously
 * reached the server and stayed cache-only for `offlineGraceMs` (the
 * SDK emits transient cache snapshots on foreground resyncs and brief
 * blips — flipping instantly flashed the offline UI while online), or
 * (c) the error handler ran. The very first cache-only snapshot does
 * NOT flip offline true — that flicker is suppressed during normal
 * startup. Both windows are deliberately generous: slow/spotty service
 * must read as "still loading", not "no internet".
 *
 * A snapshot error permanently kills the underlying listener, so the
 * wrapper resubscribes with capped exponential backoff — without this,
 * one transient error pinned the app offline until relaunch.
 * (permission-denied is the exception: retrying can't fix it, and the
 * owning effect re-subscribes on auth changes anyway.)
 *
 * `{ includeMetadataChanges: true }` is set implicitly so the listener
 * re-fires on cache↔server transitions and we recover from offline
 * back to online without the consumer doing anything.
 */
export function subscribeWithOfflineState(
  ref: FirestoreRef,
  onNext: (snapshot: any) => void,
  callbacks: OfflineCallbacks,
  options: OfflineOptions = {},
): Unsubscribe {
  const timeoutMs = options.offlineTimeoutMs ?? 15_000;
  const graceMs = options.offlineGraceMs ?? 12_000;
  let seenServer = false;
  let delivered = false;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
    timer = null;
    if (!seenServer) callbacks.setOffline(true);
  }, timeoutMs);

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  // Debounce for case (b): only declare offline if we stay cache-only for
  // the full grace window. A server snapshot cancels it.
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleOffline = () => {
    if (graceTimer !== null) return;
    graceTimer = setTimeout(() => {
      graceTimer = null;
      callbacks.setOffline(true);
    }, graceMs);
  };
  const cancelScheduledOffline = () => {
    if (graceTimer !== null) {
      clearTimeout(graceTimer);
      graceTimer = null;
    }
  };

  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelayMs = RETRY_INITIAL_MS;
  let unsubscribe: Unsubscribe | null = null;

  const start = () => {
    unsubscribe = onSnapshot(
      ref as any,
      { includeMetadataChanges: true },
      (snapshot: any) => {
        // A cold cache emits an immediate EMPTY fromCache snapshot before the
        // server answers (memory persistence starts empty every launch). It
        // carries no information, but passing it through made consumers mark
        // loading complete and flash their empty states on every cold start.
        // Hold delivery until there's real cache data or a server response —
        // the offline timeout below still unblocks consumers when the server
        // never answers.
        const isEmptyResult =
          typeof snapshot.empty === 'boolean' ? snapshot.empty : !snapshot.exists?.();
        // includeMetadataChanges re-fires the listener on the pending-write →
        // server-ack transition with IDENTICAL data. For query snapshots,
        // docChanges() (metadata excluded by default) is empty on those re-fires
        // — skip the redundant onNext so consumers don't rebuild every doc twice
        // per write. Document snapshots (no docChanges) fall through unchanged;
        // their consumers are cheap/no-op. Never skip before the first delivery.
        const metadataOnlyRefire =
          delivered &&
          typeof snapshot.docChanges === 'function' &&
          snapshot.docChanges().length === 0;
        if (!metadataOnlyRefire && (delivered || !snapshot.metadata.fromCache || !isEmptyResult)) {
          delivered = true;
          onNext(snapshot);
        }
        if (snapshot.metadata.fromCache) {
          if (seenServer) scheduleOffline();
        } else {
          seenServer = true;
          retryDelayMs = RETRY_INITIAL_MS;
          clearTimer();
          cancelScheduledOffline();
          callbacks.setOffline(false);
        }
      },
      (error: FirestoreError) => {
        clearTimer();
        cancelScheduledOffline();
        callbacks.setOffline(true);
        callbacks.onError?.(error);
        unsubscribe = null;
        if (stopped || error.code === 'permission-denied') return;
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (!stopped) start();
        }, retryDelayMs);
        retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS);
      },
    );
  };

  start();

  return () => {
    stopped = true;
    clearTimer();
    cancelScheduledOffline();
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    unsubscribe?.();
  };
}
