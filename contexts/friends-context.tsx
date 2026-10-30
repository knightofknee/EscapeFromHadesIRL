import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as Crypto from 'expo-crypto';
import { documentId } from 'firebase/firestore';
import { useAuth } from '@/contexts/auth-context';
import { useOfflineGuard } from '@/contexts/offline-context';
import { db, collection, query, where, doc, setDoc, getDoc, deleteDoc, onSnapshot } from '@/lib/firebase/firestore';
import { subscribeWithOfflineState } from '@/lib/firebase/subscribe';
import { emitError } from '@/lib/error-bus';
import { registerPushToken } from '@/lib/push-tokens';
import { CODE_LENGTH, codeFromBytes, normalizeCode, pairId } from '@/lib/friend-codes';

export { inviteUrl, normalizeCode } from '@/lib/friend-codes';

export const FRIEND_INVITES_COLLECTION = 'friendInvites';
export const FRIENDSHIPS_COLLECTION = 'friendships';
export const PROFILES_COLLECTION = 'userProfiles';
/** How long an invite link works. Reusable until then (one link for several people). */
const INVITE_DAYS = 14;

export type Friend = { uid: string; name: string };
export type AcceptResult = 'ok' | 'already' | 'self' | 'invalid' | 'expired' | 'failed';

/** What to tell the person after they enter or open a code. */
export const ACCEPT_MESSAGES: Record<AcceptResult, string> = {
  ok: 'You are now chore friends.',
  already: 'You are already chore friends.',
  self: 'That is your own code. Send it to a friend.',
  invalid: 'No invite with that code.',
  expired: 'That invite has expired. Ask for a new one.',
  failed: "Couldn't add that friend. Try again.",
};


type FriendsContextValue = {
  friends: Friend[];
  /** The name friends see for you ('' until set). */
  myName: string;
  isLoading: boolean;
  setMyName: (name: string) => Promise<boolean>;
  /** A fresh invite code, or null when blocked/failed. */
  createInvite: () => Promise<string | null>;
  acceptInvite: (code: string) => Promise<AcceptResult>;
  removeFriend: (uid: string) => Promise<boolean>;
  /** A uid's display name: you, a friend, or 'A friend'. */
  nameOf: (uid: string | undefined) => string;
};

const FriendsContext = createContext<FriendsContextValue>({
  friends: [],
  myName: '',
  isLoading: true,
  setMyName: async () => false,
  createInvite: async () => null,
  acceptInvite: async () => 'failed',
  removeFriend: async () => false,
  nameOf: () => 'A friend',
});

/**
 * Chore friends: the user's friendships (pair docs), every friend's display
 * name, and the user's own profile. Also registers this phone's push token
 * at sign-in, so shared-chore pushes can reach it.
 */
export function FriendsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { requireOnline } = useOfflineGuard();
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Push token + time zone, once per sign-in (no prompt; only if granted).
  useEffect(() => {
    if (user) void registerPushToken(user.uid);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setFriendIds([]);
      setIsLoading(true);
      return;
    }
    const uid = user.uid;
    const q = query(collection(db, FRIENDSHIPS_COLLECTION), where('memberIds', 'array-contains', uid));
    return subscribeWithOfflineState(
      q,
      (snapshot: { docs: { data: () => { memberIds?: string[] } }[] }) => {
        const ids = snapshot.docs
          .map((d) => d.data().memberIds?.find((m) => m !== uid))
          .filter((m): m is string => !!m);
        setFriendIds(Array.from(new Set(ids)).sort());
        setIsLoading(false);
      },
      {
        onError: (e) => {
          console.error('[friends] snapshot error:', e);
          setIsLoading(false);
        },
        setOffline: (offline) => {
          if (offline) setIsLoading(false);
        },
      },
    );
  }, [user]);

  // Names for me + every friend, live (a friend renaming shows up here).
  const profileIdsKey = user ? [user.uid, ...friendIds].join(',') : '';
  useEffect(() => {
    if (!profileIdsKey) {
      setNames(new Map());
      return;
    }
    const ids = profileIdsKey.split(',');
    const unsubs: (() => void)[] = [];
    // `in` takes up to 30 values per query.
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      unsubs.push(
        onSnapshot(
          query(collection(db, PROFILES_COLLECTION), where(documentId(), 'in', chunk)),
          (snap) => {
            setNames((prev) => {
              const next = new Map(prev);
              for (const id of chunk) next.delete(id);
              for (const d of snap.docs) {
                const name = d.data().displayName;
                if (typeof name === 'string' && name.trim()) next.set(d.id, name.trim());
              }
              return next;
            });
          },
          (e) => console.error('[friends] profiles error:', e),
        ),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [profileIdsKey]);

  // First time here: seed the profile name from the sign-in name, if any.
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, PROFILES_COLLECTION, user.uid);
    getDoc(ref)
      .then((snap) => {
        if (!snap.exists() && user.displayName?.trim()) {
          return setDoc(ref, { userId: user.uid, displayName: user.displayName.trim(), updatedAt: Date.now() });
        }
      })
      .catch((e) => console.warn('[friends] profile seed failed', e));
  }, [user]);

  const myName = user ? (names.get(user.uid) ?? '') : '';

  const setMyName = useCallback(
    async (name: string) => {
      if (!user || !requireOnline()) return false;
      try {
        await setDoc(
          doc(db, PROFILES_COLLECTION, user.uid),
          { userId: user.uid, displayName: name.trim().slice(0, 40), updatedAt: Date.now() },
          { merge: true },
        );
        return true;
      } catch (e) {
        console.error('[friends] name save failed', e);
        emitError("Couldn't save your name.");
        return false;
      }
    },
    [user, requireOnline],
  );

  const createInvite = useCallback(async () => {
    if (!user || !requireOnline()) return null;
    try {
      const bytes = await Crypto.getRandomBytesAsync(CODE_LENGTH);
      const code = codeFromBytes(bytes);
      const now = Date.now();
      await setDoc(doc(db, FRIEND_INVITES_COLLECTION, code), {
        userId: user.uid,
        createdAt: now,
        expiresAt: now + INVITE_DAYS * 24 * 60 * 60 * 1000,
      });
      return code;
    } catch (e) {
      console.error('[friends] invite failed', e);
      emitError("Couldn't make an invite link.");
      return null;
    }
  }, [user, requireOnline]);

  const acceptInvite = useCallback(
    async (raw: string): Promise<AcceptResult> => {
      if (!user || !requireOnline()) return 'failed';
      const code = normalizeCode(raw);
      if (code.length < 8) return 'invalid';
      try {
        const invite = await getDoc(doc(db, FRIEND_INVITES_COLLECTION, code));
        if (!invite.exists()) return 'invalid';
        const { userId, expiresAt } = invite.data() as { userId: string; expiresAt: number };
        if (userId === user.uid) return 'self';
        if (expiresAt <= Date.now()) return 'expired';
        if (friendIds.includes(userId)) return 'already';
        const { id, memberIds } = pairId(user.uid, userId);
        await setDoc(doc(db, FRIENDSHIPS_COLLECTION, id), { memberIds, inviteCode: code, createdAt: Date.now() });
        return 'ok';
      } catch (e) {
        console.error('[friends] accept failed', e);
        return 'failed';
      }
    },
    [user, requireOnline, friendIds],
  );

  const removeFriend = useCallback(
    async (friendUid: string) => {
      if (!user || !requireOnline()) return false;
      try {
        await deleteDoc(doc(db, FRIENDSHIPS_COLLECTION, pairId(user.uid, friendUid).id));
        return true;
      } catch (e) {
        console.error('[friends] remove failed', e);
        emitError("Couldn't remove that friend.");
        return false;
      }
    },
    [user, requireOnline],
  );

  const nameOf = useCallback(
    (uid: string | undefined) => {
      if (!uid) return 'A friend';
      if (uid === user?.uid) return 'You';
      return names.get(uid) ?? 'A friend';
    },
    [names, user],
  );

  const friends = useMemo(
    () =>
      friendIds
        .map((uid) => ({ uid, name: names.get(uid) ?? 'A friend' }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [friendIds, names],
  );

  const value = useMemo(
    () => ({ friends, myName, isLoading, setMyName, createInvite, acceptInvite, removeFriend, nameOf }),
    [friends, myName, isLoading, setMyName, createInvite, acceptInvite, removeFriend, nameOf],
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

export function useFriends(): FriendsContextValue {
  return useContext(FriendsContext);
}
