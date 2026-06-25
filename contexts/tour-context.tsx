import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { View } from 'react-native';
import { router, useSegments } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';
import { useHabits } from '@/hooks/use-habits';
import { useQuests } from '@/hooks/use-quests';
import { DEV_FORCE_TOUR, getSeen, setSeen } from '@/lib/tutorial-flags';
import { buildGenesisTour, type TaskState, type TourStep } from '@/lib/tour-steps';
import { SpotlightTour } from '@/components/tour/spotlight-tour';
import {
  TourContext,
  type Rect,
  type TargetRef,
  type TourContextValue,
} from '@/contexts/tour-context-core';

// The context object, `useTour`, and `useTourTarget` live in tour-context-core
// (which imports nothing back) so SpotlightTour can consume the tour without a
// require cycle. Re-exported here so existing `@/contexts/tour-context`
// importers keep working unchanged.
export { useTour, useTourTarget } from '@/contexts/tour-context-core';
export type { Rect } from '@/contexts/tour-context-core';

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const segments = useSegments();
  const { habits, isLoading: habitsLoading } = useHabits();
  const { quests, isLoading: questsLoading } = useQuests();

  const targets = useRef<Map<string, TargetRef>>(new Map());
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);

  const taskState = useMemo<TaskState>(
    () => ({ habits: habits.length, quests: quests.length }),
    [habits.length, quests.length],
  );

  const registerTarget = useCallback((key: string, ref: TargetRef | null) => {
    if (ref) targets.current.set(key, ref);
    else targets.current.delete(key);
  }, []);

  const measureTarget = useCallback((key: string): Promise<Rect | null> => {
    return new Promise((resolve) => {
      const node = targets.current.get(key)?.current as
        | { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void }
        | undefined;
      if (!node || typeof node.measureInWindow !== 'function') {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => {
        resolve(width || height ? { x, y, width, height } : null);
      });
    });
  }, []);

  const endTour = useCallback(
    (_finished: boolean) => {
      setIsActive(false);
      setSteps(null);
      setIndex(0);
      // Already marked seen on start; re-assert so a finish/skip always sticks.
      if (user) setSeen('genesis', true, user.uid);
    },
    [user],
  );

  const onNext = useCallback(() => {
    setIndex((i) => {
      if (!steps) return i;
      if (i >= steps.length - 1) {
        // Defer out of the state updater.
        setTimeout(() => endTour(true), 0);
        return i;
      }
      return i + 1;
    });
  }, [steps, endTour]);

  const onBack = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const onSkip = useCallback(() => endTour(false), [endTour]);

  const startGenesis = useCallback(() => {
    setSteps(
      buildGenesisTour({
        goHabits: () => router.navigate('/(tabs)/(habits)'),
        goQuests: () => router.navigate('/(tabs)/(quests)'),
      }),
    );
    setIndex(0);
    setIsActive(true);
  }, []);

  // Run a step's one-shot side effect (navigation) once on entry.
  const lastEnterRef = useRef(-1);
  useEffect(() => {
    if (!isActive || !steps) {
      lastEnterRef.current = -1;
      return;
    }
    if (lastEnterRef.current === index) return;
    lastEnterRef.current = index;
    steps[index]?.onEnter?.();
  }, [isActive, index, steps]);

  // Auto-start the descent for a brand-new wanderer: signed in, data loaded,
  // and nothing built yet. The intro opens with the starter-tasks picker (the
  // start of the tour); finishing/skipping it hands off to the spotlight beats
  // via startGenesis(). Marked seen the instant it opens so a background /
  // foreground cycle can't re-pop it mid-tour.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current || isActive) return;
    if (!user || segments[0] === '(auth)') return;
    if (habitsLoading || questsLoading) return;
    // Only brand-new wanderers in production; DEV_FORCE_TOUR bypasses this so
    // the flow can be previewed on an account that already has data.
    if (!DEV_FORCE_TOUR && (habits.length !== 0 || quests.length !== 0)) return;

    let cancelled = false;
    (async () => {
      const seen = await getSeen('genesis', user.uid);
      if (cancelled || seen) return;
      autoStartedRef.current = true;
      await setSeen('genesis', true, user.uid);
      router.navigate('/starter-setup?intro=1');
    })();
    return () => {
      cancelled = true;
    };
  }, [user, segments, habitsLoading, questsLoading, habits.length, quests.length, isActive]);

  const value = useMemo<TourContextValue>(
    () => ({
      isActive,
      steps,
      index,
      taskState,
      registerTarget,
      measureTarget,
      onNext,
      onBack,
      onSkip,
      startGenesis,
    }),
    [isActive, steps, index, taskState, registerTarget, measureTarget, onNext, onBack, onSkip, startGenesis],
  );

  return (
    <TourContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {isActive && <SpotlightTour />}
      </View>
    </TourContext.Provider>
  );
}
