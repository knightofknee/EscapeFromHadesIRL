import { useState, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, Pressable, View, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, Easing } from 'react-native-reanimated';
import { router } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WeekGrid } from '@/components/habits/week-grid';
import { SuccessColorPicker } from '@/components/habits/success-color-picker';
import { useHabits } from '@/hooks/use-habits';
import { useHabitRecords, getWeekDates } from '@/hooks/use-habit-records';
import { useAuth } from '@/contexts/auth-context';
import { db, doc, setDoc } from '@/lib/firebase/firestore';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSuccessColors } from '@/hooks/use-success-colors';
import type { HabitRecord, TripleValue, QuadValue } from '@/types/habit';

export default function WeekViewScreen() {
  const { user } = useAuth();
  const { habits } = useHabits();
  const colorScheme = useColorScheme();
  const scheme = colorScheme ?? 'light';
  const colors = Colors[scheme];
  const { colors: successColors } = useSuccessColors(scheme);
  const [weekOffset, setWeekOffset] = useState(0);

  const refDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const { dates, startDate, endDate } = useMemo(() => getWeekDates(refDate), [refDate]);
  const { recordsByDate } = useHabitRecords(startDate, endDate);

  const handleTapHabit = useCallback(
    (habitId: string, date: string) => {
      if (!user) return;
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;

      const existingRecords = recordsByDate[date];
      const existing = existingRecords?.get(habitId);

      let newValue: boolean | TripleValue | QuadValue | number | string;
      switch (habit.recordingMode) {
        case 'boolean':
          newValue = existing ? !existing.value : true;
          break;
        case 'triple': {
          const cur = (existing?.value as TripleValue) ?? 'no';
          newValue = cur === 'no' ? 'yes' : cur === 'yes' ? 'double' : 'no';
          break;
        }
        case 'quad': {
          const cur = (existing?.value as QuadValue) ?? 'no';
          newValue = cur === 'no' ? 'yes' : cur === 'yes' ? 'goal' : cur === 'goal' ? 'ideal' : 'no';
          break;
        }
        case 'counter':
          newValue = ((existing?.value as number) ?? 0) + 1;
          break;
        case 'value':
          // For week view, just toggle presence
          newValue = existing?.value ? '' : '1';
          break;
      }

      const docId = `${habitId}_${date}`;
      const record: HabitRecord = {
        id: docId,
        habitId,
        userId: user.uid,
        date,
        value: newValue,
        recordedAt: Date.now(),
      };
      setDoc(doc(db, 'records', docId), record);
    },
    [user, habits, recordsByDate],
  );

  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const screenWidth = Dimensions.get('window').width;
  const SWIPE_THRESHOLD = screenWidth * 0.2;

  const changeWeek = useCallback((direction: number) => {
    setWeekOffset((o) => o + direction);
  }, []);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      // Fade out as user drags further
      opacity.value = 1 - Math.min(Math.abs(e.translationX) / screenWidth, 0.4);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD || Math.abs(e.velocityX) > 500) {
        const direction = e.translationX > 0 ? -1 : 1;
        // Slide off screen, change week, then reset
        translateX.value = withTiming(direction * -screenWidth, { duration: 200, easing: Easing.out(Easing.cubic) }, () => {
          runOnJS(changeWeek)(direction);
          translateX.value = 0;
          opacity.value = 1;
        });
      } else {
        translateX.value = withTiming(0, { duration: 150 });
        opacity.value = withTiming(1, { duration: 150 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const weekLabel = useMemo(() => {
    const start = dates[0];
    const end = dates[6];
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [dates]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ThemedView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setWeekOffset((o) => o - 1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>‹</ThemedText>
          </Pressable>
          <Pressable onPress={() => setWeekOffset(0)}>
            <ThemedText type="defaultSemiBold" style={styles.weekLabel}>
              {weekLabel}
            </ThemedText>
          </Pressable>
          <Pressable onPress={() => setWeekOffset((o) => o + 1)} style={styles.navButton}>
            <ThemedText style={styles.navText}>›</ThemedText>
          </Pressable>
        </View>

        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <ThemedText style={[styles.backText, { color: colors.tint }]}>← Day View</ThemedText>
        </Pressable>

        {habits.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ThemedText style={{ opacity: 0.5, fontSize: 16 }}>No habits yet</ThemedText>
          </View>
        ) : (
          <GestureDetector gesture={swipeGesture}>
            <Animated.View style={[{ flex: 1 }, animatedStyle]}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
                <WeekGrid
                  dates={dates}
                  habits={habits}
                  recordsByDate={recordsByDate}
                  onTapHabit={handleTapHabit}
                  successColors={successColors}
                />
                <SuccessColorPicker />
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: {
    fontSize: 28,
    fontWeight: '300',
  },
  weekLabel: {
    fontSize: 16,
  },
  backLink: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
