/**
 * Global callback for linking a newly created habit back to the quest screen
 * that initiated the creation. Set before navigating to tile-settings,
 * consumed after the habit is created, then cleared.
 */

let pendingCallback: ((habitId: string) => void) | null = null;

export function setPendingHabitCallback(cb: (habitId: string) => void) {
  pendingCallback = cb;
}

export function consumePendingHabitCallback(habitId: string) {
  if (pendingCallback) {
    pendingCallback(habitId);
    pendingCallback = null;
  }
}

export function clearPendingHabitCallback() {
  pendingCallback = null;
}
