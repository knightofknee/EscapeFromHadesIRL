import { createContext, useContext, useEffect, useRef } from 'react';
import type { View } from 'react-native';
import type { TaskState, TourStep } from '@/lib/tour-steps';

// The context object + hooks + shared types live here, in a module that
// imports nothing from the provider or the overlay. That's what breaks the
// require cycle: `SpotlightTour` reads the tour via `useTour` from THIS file,
// while `TourProvider` (which renders `SpotlightTour`) lives in
// tour-context.tsx. Neither side imports the other at module-eval time.

export type Rect = { x: number; y: number; width: number; height: number };
export type TargetRef = React.RefObject<View | null>;

export type TourContextValue = {
  isActive: boolean;
  steps: TourStep[] | null;
  index: number;
  taskState: TaskState;
  registerTarget: (key: string, ref: TargetRef | null) => void;
  measureTarget: (key: string) => Promise<Rect | null>;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  /** Start the first-descent tour on demand (auto-fires for new wanderers). */
  startGenesis: () => void;
};

export const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within a TourProvider');
  return ctx;
}

/** Attach the returned ref to a View/Pressable to make it a spotlight target. */
export function useTourTarget(key: string) {
  const { registerTarget } = useTour();
  const ref = useRef<View | null>(null);
  useEffect(() => {
    registerTarget(key, ref);
    return () => registerTarget(key, null);
  }, [key, registerTarget]);
  return ref;
}
