import { useQuestsContext } from '@/contexts/quests-context';

/**
 * Active-quests data + mutations. Backed by the app-wide QuestsProvider
 * (one shared listener) — see contexts/quests-context.tsx. Return shape is
 * unchanged so call sites don't change.
 */
export function useQuests() {
  return useQuestsContext();
}
