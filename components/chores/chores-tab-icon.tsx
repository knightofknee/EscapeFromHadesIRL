import { useMemo } from 'react';
import { StyleSheet, Text, View, type ColorValue } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useChores } from '@/contexts/chores-context';
import { useTodayDate } from '@/hooks/use-today-date';
import { countDue } from '@/lib/chores';
import { CHORE_STATE_COLORS } from './chore-colors';

/**
 * The Chores tab icon with notification-style count bubbles: gold for due,
 * red for overdue (a week or more late). Lets you see from any tab that
 * chores need attention, without taking any room. Nothing shows when
 * everything's on track.
 */
export function ChoresTabIcon({ color }: { color: ColorValue }) {
  const { chores } = useChores();
  const { todayStr } = useTodayDate();
  const { due, overdue } = useMemo(() => countDue(chores, todayStr), [chores, todayStr]);

  return (
    <View>
      <IconSymbol size={28} name="house.fill" color={color} />
      {(due > 0 || overdue > 0) && (
        <View style={styles.bubbles} pointerEvents="none">
          {due > 0 && <Bubble count={due} color={CHORE_STATE_COLORS.due} ink="#1A1400" />}
          {overdue > 0 && <Bubble count={overdue} color={CHORE_STATE_COLORS.overdue} ink="#FFFFFF" />}
        </View>
      )}
    </View>
  );
}

function Bubble({ count, color, ink }: { count: number; color: string; ink: string }) {
  return (
    <View style={[styles.bubble, { backgroundColor: color }]}>
      <Text style={[styles.count, { color: ink }]}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bubbles: {
    position: 'absolute',
    top: -6,
    left: 18,
    flexDirection: 'row',
    gap: 2,
  },
  bubble: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
