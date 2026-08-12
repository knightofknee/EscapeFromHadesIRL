/**
 * Timing/recovery contract for subscribeWithOfflineState:
 * - forgiving windows (slow service reads as loading, not offline)
 * - grace debounce for cache-only blips after data has loaded
 * - auto-resubscribe with backoff after listener errors (a raw onSnapshot
 *   listener dies permanently on error, which used to pin the app offline
 *   until relaunch)
 */
jest.mock('firebase/firestore', () => ({
  onSnapshot: jest.fn(),
}));

import { onSnapshot } from 'firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';

const mockOnSnapshot = onSnapshot as unknown as jest.Mock;

type Handler = { next: (snap: any) => void; error: (err: any) => void };

let handlers: Handler[];
let innerUnsubs: jest.Mock[];

function serverSnap(docCount = 1) {
  const docs = Array.from({ length: docCount }, (_, i) => ({ id: `d${i}` }));
  return {
    metadata: { fromCache: false },
    empty: docCount === 0,
    docs,
    docChanges: () => docs.map((d) => ({ doc: d })),
  };
}

function cacheSnap(docCount = 0) {
  const docs = Array.from({ length: docCount }, (_, i) => ({ id: `d${i}` }));
  return {
    metadata: { fromCache: true },
    empty: docCount === 0,
    docs,
    docChanges: () => docs.map((d) => ({ doc: d })),
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  handlers = [];
  innerUnsubs = [];
  mockOnSnapshot.mockReset();
  mockOnSnapshot.mockImplementation((_ref, _opts, next, error) => {
    handlers.push({ next, error });
    const unsub = jest.fn();
    innerUnsubs.push(unsub);
    return unsub;
  });
});

afterEach(() => {
  jest.useRealTimers();
});

function subscribe() {
  const onNext = jest.fn();
  const setOffline = jest.fn();
  const onError = jest.fn();
  const unsubscribe = subscribeWithOfflineState({} as any, onNext, {
    setOffline,
    onError,
  });
  return { onNext, setOffline, onError, unsubscribe };
}

describe('cold-start forgiveness', () => {
  it('does not declare offline before 15s without a server snapshot', () => {
    const { setOffline } = subscribe();
    jest.advanceTimersByTime(14_900);
    expect(setOffline).not.toHaveBeenCalled();
  });

  it('declares offline after 15s without a server snapshot', () => {
    const { setOffline } = subscribe();
    jest.advanceTimersByTime(15_000);
    expect(setOffline).toHaveBeenCalledWith(true);
  });

  it('a server snapshot before the timeout keeps us online', () => {
    const { setOffline, onNext } = subscribe();
    jest.advanceTimersByTime(10_000);
    handlers[0].next(serverSnap());
    jest.advanceTimersByTime(60_000);
    expect(setOffline).toHaveBeenCalledWith(false);
    expect(setOffline).not.toHaveBeenCalledWith(true);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('withholds the initial empty cache snapshot from consumers', () => {
    const { onNext } = subscribe();
    handlers[0].next(cacheSnap(0));
    expect(onNext).not.toHaveBeenCalled();
    handlers[0].next(serverSnap(0));
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('cache-only grace after data has loaded', () => {
  it('waits out a 12s grace window before flipping offline', () => {
    const { setOffline } = subscribe();
    handlers[0].next(serverSnap());
    handlers[0].next(cacheSnap(1));
    jest.advanceTimersByTime(11_900);
    expect(setOffline).not.toHaveBeenCalledWith(true);
    jest.advanceTimersByTime(100);
    expect(setOffline).toHaveBeenCalledWith(true);
  });

  it('a server snapshot inside the grace window cancels the offline flip', () => {
    const { setOffline } = subscribe();
    handlers[0].next(serverSnap());
    handlers[0].next(cacheSnap(1));
    jest.advanceTimersByTime(8_000);
    handlers[0].next(serverSnap());
    jest.advanceTimersByTime(60_000);
    expect(setOffline).not.toHaveBeenCalledWith(true);
  });
});

describe('listener-error recovery', () => {
  it('flips offline, reports the error, and resubscribes after backoff', () => {
    const { setOffline, onError } = subscribe();
    handlers[0].error({ code: 'unavailable' });
    expect(setOffline).toHaveBeenCalledWith(true);
    expect(onError).toHaveBeenCalled();
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2_000);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);

    handlers[1].next(serverSnap());
    expect(setOffline).toHaveBeenCalledWith(false);
  });

  it('backs off exponentially between retries', () => {
    subscribe();
    handlers[0].error({ code: 'unavailable' });
    jest.advanceTimersByTime(2_000);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);

    handlers[1].error({ code: 'unavailable' });
    jest.advanceTimersByTime(3_900);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(100);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(3);
  });

  it('a server snapshot resets the retry backoff', () => {
    subscribe();
    handlers[0].error({ code: 'unavailable' });
    jest.advanceTimersByTime(2_000);
    handlers[1].error({ code: 'unavailable' });
    jest.advanceTimersByTime(4_000);
    // Recovered: backoff should return to the initial delay.
    handlers[2].next(serverSnap());
    handlers[2].error({ code: 'unavailable' });
    jest.advanceTimersByTime(2_000);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(4);
  });

  it('does not retry after permission-denied', () => {
    subscribe();
    handlers[0].error({ code: 'permission-denied' });
    jest.advanceTimersByTime(120_000);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing cancels a pending retry', () => {
    const { unsubscribe } = subscribe();
    handlers[0].error({ code: 'unavailable' });
    unsubscribe();
    jest.advanceTimersByTime(120_000);
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
  });

  it('unsubscribing tears down the live inner listener', () => {
    const { unsubscribe } = subscribe();
    handlers[0].error({ code: 'unavailable' });
    jest.advanceTimersByTime(2_000);
    unsubscribe();
    expect(innerUnsubs[1]).toHaveBeenCalled();
  });
});
