import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Alert } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { db, doc } from '@/lib/firebase/firestore';
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
