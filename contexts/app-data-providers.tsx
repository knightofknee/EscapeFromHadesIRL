import { type ReactNode } from 'react';
import { HabitsProvider } from '@/contexts/habits-context';
import { UserSettingsProvider } from '@/contexts/user-settings-context';
import { VacationDaysProvider } from '@/contexts/vacation-days-context';
import { QuestsProvider } from '@/contexts/quests-context';
import { RecordsProvider } from '@/contexts/records-context';
import { NotesProvider } from '@/contexts/notes-context';

/**
 * Mounts every shared per-user data listener exactly once, under the auth gate
 * (see app/_layout.tsx — nested inside AuthProvider + OfflineProvider, which
 * these all consume). Each listener used to be opened per-screen; because tabs
 * stay mounted once visited, that meant several live copies of the same query.
 * Now there is one of each.
 *
 * Order matters: NotesProvider reads HabitsContext for the creative-writing
 * bump (a context read, not a second habits listener), so HabitsProvider must
 * be an ancestor. The others are independent.
 */
export function AppDataProviders({ children }: { children: ReactNode }) {
  return (
    <HabitsProvider>
      <UserSettingsProvider>
        <VacationDaysProvider>
          <QuestsProvider>
            <RecordsProvider>
              <NotesProvider>{children}</NotesProvider>
            </RecordsProvider>
          </QuestsProvider>
        </VacationDaysProvider>
      </UserSettingsProvider>
    </HabitsProvider>
  );
}
