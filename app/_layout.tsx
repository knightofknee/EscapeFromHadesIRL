import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
// Theme symbols come from expo-router (it vendors react-navigation as of
// SDK 56) — the @react-navigation/native copies would feed a theme context
// the vendored navigators never read.
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View, Image, StyleSheet, AppState, Appearance } from 'react-native';
import 'react-native-reanimated';
import * as Notifications from 'expo-notifications';

// Set the notification handler ONCE at app startup so that meditation-timer
// completion notifications still play the default sound + show a banner
// when the app is in the foreground. Without this, iOS silently swallows
// notifications that fire while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    // The meditation completion alarm rings in-app (looping bell + takeover)
    // when foregrounded, so mute its notification sound here to avoid playing
    // both at once. The banner still shows. This handler only runs in the
    // foreground; backgrounded/locked delivery keeps the alarm sound.
    const isMeditationAlarm =
      notification.request.content.data?.kind === 'meditation-alarm';
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: !isMeditationAlarm,
      shouldSetBadge: false,
    };
  },
});

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAppearance } from '@/hooks/use-appearance';
import { NoteMediaJanitor } from '@/components/notes/note-media-janitor';
import { ErrorToast } from '@/components/ui/error-toast';
import { OfflineModal } from '@/components/ui/offline-modal';
import { UpdateModal } from '@/components/ui/update-modal';
import { UpdateRequiredGate } from '@/components/ui/update-required-gate';
import { CalendarTipsModal } from '@/components/ui/calendar-tips-modal';
import { ActiveDayTracker } from '@/hooks/use-earned-quote';
import { MeditationAlarmWatcher } from '@/components/habits/meditation-alarm-watcher';
import { AuthProvider, useAuth } from '@/contexts/auth-context';
import { OfflineProvider } from '@/contexts/offline-context';
import { AppDataProviders } from '@/contexts/app-data-providers';
import { TourProvider } from '@/contexts/tour-context';
import { getHomeScreen } from '@/hooks/use-home-screen';
import { getFreshNoteResetMinutes } from '@/hooks/use-fresh-note-reset';
import { getLastView, getLastHiddenAt, recordAppHidden } from '@/lib/last-view';
import { db, collection, doc, setDoc, deleteDoc, query, where, getDocs } from '@/lib/firebase/firestore';
import type { User } from 'firebase/auth';

/** Blank notes pile up when a fresh-note launch creates one and the app is
 *  killed before anything is typed (in-app exits already auto-delete them).
 *  Swept in the background after each fresh-note launch. */
async function cleanupAbandonedEmptyNotes(userId: string, keepId: string): Promise<void> {
  try {
    const q = query(
      collection(db, 'notes'),
      where('userId', '==', userId),
      where('title', '==', ''),
      where('content', '==', ''),
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      if (d.id === keepId) continue;
      const n = d.data() as { tags?: unknown[]; type?: string };
      // Bare text notes only. Checklists and tagged notes are deliberate
      // user state.
      if ((n.tags?.length ?? 0) > 0 || n.type === 'checklist') continue;
      deleteDoc(doc(db, 'notes', d.id)).catch(() => {});
    }
  } catch {
    // Offline / slow: strays survive until a later launch sweeps them.
  }
}

async function routeToFreshNote(userId: string, replace: (href: string) => void) {
  try {
    const ref = doc(collection(db, 'notes'));
    const now = Date.now();
    // Awaited: if the write rejects (rules/network), fall back to the notes
    // list instead of routing into a note that doesn't exist. Offline, a
    // Firestore write promise never settles (it only resolves on server
    // ack), so race a timeout — the user must not hang on the splash, and a
    // late ack must not yank them into an empty note minutes into a session.
    const created = await Promise.race([
      setDoc(ref, {
        id: ref.id,
        userId,
        title: '',
        content: '',
        tags: [],
        createdAt: now,
        updatedAt: now,
      }).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ]);
    replace(created ? `/(tabs)/(notes)/${ref.id}?new=1` : '/(tabs)/(notes)');
    if (created) void cleanupAbandonedEmptyNotes(userId, ref.id);
  } catch {
    replace('/(tabs)/(notes)');
  }
}

/** True when notes-as-home is on AND the app has been out of sight longer
 *  than the "new note reset" window (unknown = long enough). */
async function shouldOpenFreshNote(): Promise<boolean> {
  const home = await getHomeScreen();
  if (home !== 'notes') return false;
  const [resetMinutes, hiddenAt] = await Promise.all([
    getFreshNoteResetMinutes(),
    getLastHiddenAt(),
  ]);
  if (hiddenAt === null) return true; // first run / unknown: treat as long-away
  return Date.now() - hiddenAt >= resetMinutes * 60_000;
}

/** Restore the previous notes view: the last note open (the note screen
 *  handles not-found), else the notes list. */
async function routeToLastView(replace: (href: string) => void, push: (href: string) => void) {
  const lastView = await getLastView();
  replace('/(tabs)/(notes)');
  if (lastView.type === 'note') {
    push(`/(tabs)/(notes)/${lastView.id}`);
  }
}

async function routeToHome(
  userId: string,
  replace: (href: string) => void,
  push: (href: string) => void,
) {
  const home = await getHomeScreen();
  if (home !== 'notes') {
    replace('/(tabs)/(habits)');
    return;
  }
  // Notes-as-home: a fresh note after being away past the reset window
  // (Settings > New note reset), otherwise back where you were.
  if (await shouldOpenFreshNote()) {
    await routeToFreshNote(userId, replace);
  } else {
    await routeToLastView(replace, push);
  }
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const prevUserRef = useRef<User | null>(null);
  // Cold start renders the navigator before routeToHome decides where to
  // land. Keep the splash on top until that decision is made, so launch goes
  // splash → destination with no flash of the default tab in between.
  const [bootRouting, setBootRouting] = useState(true);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const prevUser = prevUserRef.current;
    prevUserRef.current = user;
    const justSignedIn = !prevUser && !!user;

    if (!user) {
      if (!inAuthGroup) router.replace('/(auth)/sign-in');
      setBootRouting(false);
      return;
    }

    // Route to home on fresh sign-in (cold start or post-auth flow)
    if (justSignedIn || inAuthGroup) {
      routeToHome(
        user.uid,
        (href) => router.replace(href as never),
        (href) => router.push(href as never),
      ).finally(() => setBootRouting(false));
      return;
    }
    setBootRouting(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable, including it causes infinite loops
  }, [user, isLoading, segments]);

  // New note reset on warm return: back in the foreground after sitting in
  // the background past the reset window, a notes-as-home user who left from
  // the Notes tab lands on a fresh note (cold starts are handled by
  // routeToHome above). Someone who left from another tab keeps their place.
  // Background/inactive transitions stamp the "stopped looking" time that
  // both paths compare against.
  const userRef = useRef<User | null>(null);
  const inNotesRef = useRef(false);
  const inNotes = segments[0] === '(tabs)' && segments[1] === '(notes)';
  useEffect(() => {
    userRef.current = user;
    inNotesRef.current = inNotes;
  }, [user, inNotes]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'background' || state === 'inactive') {
        recordAppHidden();
        return;
      }
      if (state !== 'active') return;
      const activeUser = userRef.current;
      if (!activeUser || !inNotesRef.current) {
        recordAppHidden();
        return;
      }
      const fresh = await shouldOpenFreshNote();
      // Re-stamp so a spurious second 'active' event can't double-create.
      recordAppHidden();
      if (fresh) {
        await routeToFreshNote(activeUser.uid, (href) => router.replace(href as never));
      }
    });
    return () => sub.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- router is stable
  }, []);

  if (isLoading) {
    return (
      <View style={loadingStyles.container}>
        <Image
          source={require('@/assets/images/splash-icon.png')}
          style={loadingStyles.logo}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Custom in-screen header (no native bar): iOS 26 wraps native bar
            buttons in glass capsules we can't opt out of, so the screen draws
            its own plain-text Cancel/Save row. */}
        <Stack.Screen name="tile-settings" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="chore-edit" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="chore-starter" options={{ presentation: 'modal', headerShown: false }} />
        {/* Draws its own back-row header (same iOS 26 capsule reason as
            tile-settings) — without this entry it gets a default native bar
            titled "revive-habit" stacked above its own. */}
        <Stack.Screen name="revive-habit" options={{ presentation: 'modal', headerShown: false }} />
        {/* Starter-tasks intro picker (draws its own header). Opened as the start
            of the Genesis tour for new users and from the habits ••• menu. */}
        <Stack.Screen name="starter-setup" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="export-notes" options={{ presentation: 'modal', title: 'Export Notes' }} />
        {/* Note photo/video viewer and the phone-to-phone media transfer
            (both draw their own headers). */}
        <Stack.Screen name="media-viewer" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="media-transfer" options={{ presentation: 'modal', headerShown: false }} />
      </Stack>
      {bootRouting && (
        <View style={[loadingStyles.container, StyleSheet.absoluteFill]}>
          <Image
            source={require('@/assets/images/splash-icon.png')}
            style={loadingStyles.logo}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  // useColorScheme already folds the stored appearance preference together
  // with the system scheme (including legacy 'system' values) — every
  // component resolves through it, so the navigation theme and root status
  // bar must too, or a 'system' preference renders light components inside
  // a dark nav theme.
  const effectiveScheme = useColorScheme() ?? 'dark';
  // Push the app's Light/Dark choice down to iOS/Android so NATIVE surfaces
  // follow it too: the rich notes editor's keyboard (it has no
  // keyboardAppearance prop), system alerts, pickers and share sheets.
  // Without this they follow the phone's setting while the app stays dark.
  const { appearance } = useAppearance();
  useEffect(() => {
    Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance);
  }, [appearance]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AuthProvider>
          <OfflineProvider>
            <AppDataProviders>
              <ThemeProvider value={effectiveScheme === 'dark' ? DarkTheme : DefaultTheme}>
                {/* TourProvider wraps the navigator so the spotlight overlay
                    paints above the tabs + tab bar. ErrorToast/StatusBar stay
                    outside it so toasts still render above the tour. */}
                <TourProvider>
                  <RootNavigator />
                  {/* Inside TourProvider only for useTour (it renders null
                      while the tour runs) — as an RN Modal its stacking is
                      independent of tree position anyway. */}
                  <UpdateModal />
                  <CalendarTipsModal />
                </TourProvider>
                {/* Counts active days from the root so notes-first sessions
                    still count toward milestone quotes. */}
                <ActiveDayTracker />
                {/* Weekly sweep of note photos/videos no note uses anymore. */}
                <NoteMediaJanitor />
                {/* Roots the meditation-timer cleanup outside the habits
                    screen — a timer that finishes while its sheet is closed
                    still gets logged and torn down. */}
                <MeditationAlarmWatcher />
                <ErrorToast />
                <OfflineModal />
                {/* Last in the tree so it paints over everything above: the
                    hard floor from Config/app.minVersion (lib/update-gate.ts). */}
                <UpdateRequiredGate />
                <StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
              </ThemeProvider>
            </AppDataProviders>
          </OfflineProvider>
        </AuthProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
});
