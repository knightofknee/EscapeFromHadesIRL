import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert, AppState } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, disableNetwork, enableNetwork } from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';

interface OfflineContextValue {
  isOffline: boolean;
  /**
   * Returns true if online; returns false (and surfaces a deduped
   * "No internet" alert) when offline. Use to guard writes that
   * shouldn't accept false-success while the network is down.
   */
  requireOnline: () => boolean;
}

const OfflineContext = createContext<OfflineContextValue>({
  isOffline: false,
  requireOnline: () => true,
});

const ALERT_DEDUPE_MS = 5_000;

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isOffline, setIsOffline] = useState(false);
  const isOfflineRef = useRef(false);
  const lastAlertAtRef = useRef(0);

  // Mirror state into a ref so requireOnline can be a stable useCallback
  // without staling on isOffline updates.
  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  // App-wide heartbeat: subscribe to the signed-in user's settings doc.
  // It's small and per-user, so it's a cheap signal for whether the SDK
  // is currently reaching the server. The data itself is ignored here;
  // useSuccessColors consumes the same doc independently.
  useEffect(() => {
    if (!user) {
      setIsOffline(false);
      return;
    }
    return subscribeWithOfflineState(
      doc(db, 'userSettings', user.uid),
      () => {},
      { setOffline: setIsOffline },
    );
  }, [user]);

  // Recovery nudge. The Firestore Web SDK never hears about OS network
  // changes on React Native (no browser online/offline events), so after
  // service returns it can sit in a long retry backoff — or a wedged
  // connection — and never notice. While we're offline, periodically cycle
  // the SDK's network off/on (resets the backoff and forces an immediate
  // reconnect attempt), and do the same when the app foregrounds since iOS
  // kills sockets in the background. Stops as soon as we're back online.
  useEffect(() => {
    if (!isOffline) return;
    let cycling = false;
    const nudge = async () => {
      if (cycling) return;
      cycling = true;
      try {
        // Always re-enable after disabling, even on cleanup mid-cycle —
        // leaving the network disabled would BE the outage.
        await disableNetwork(db);
        await enableNetwork(db);
      } catch {
        // Best-effort; the next interval tries again.
      } finally {
        cycling = false;
      }
    };
    // First nudge waits a full interval: offline was just declared after a
    // long quiet window, and instantly tearing down a slow-but-live
    // handshake would defeat the forgiveness.
    const interval = setInterval(nudge, 20_000);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') nudge();
    });
    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [isOffline]);

  const requireOnline = useCallback(() => {
    if (!isOfflineRef.current) return true;
    const now = Date.now();
    if (now - lastAlertAtRef.current >= ALERT_DEDUPE_MS) {
      lastAlertAtRef.current = now;
      Alert.alert(
        'No internet connection',
        'Connect to the internet to save changes.',
      );
    }
    return false;
  }, []);

  return (
    <OfflineContext.Provider value={{ isOffline, requireOnline }}>
      {children}
    </OfflineContext.Provider>
  );
}

export function useOfflineGuard(): OfflineContextValue {
  return useContext(OfflineContext);
}
