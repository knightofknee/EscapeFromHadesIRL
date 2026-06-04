import { useVacationDaysContext } from '@/contexts/vacation-days-context';

/**
 * Vacation-day lookups + contiguous-block helpers. Backed by the app-wide
 * VacationDaysProvider (one shared listener) — see
 * contexts/vacation-days-context.tsx. Return shape is unchanged so call sites
 * don't change.
 */
export function useVacationDays() {
  return useVacationDaysContext();
}
