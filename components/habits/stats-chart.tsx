import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

type DataPoint = {
  date: string;
  value: number;
};

type StatsChartProps = {
  data: DataPoint[];
  title: string;
  color?: string;
  height?: number;
};

export function StatsChart({ data, title, color, height = 200 }: StatsChartProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const chartColor = color ?? colors.tileRecorded;

  if (data.length === 0) {
    return (
      <View style={[styles.container, { height, backgroundColor: colors.tileBackground }]}>
        <ThemedText style={styles.emptyText}>No data yet</ThemedText>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={[styles.container, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
      <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
      <View style={[styles.chartArea, { height }]}>
        {data.map((point, i) => {
          const barHeight = (point.value / maxValue) * (height - 30);
          return (
            <View key={point.date} style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(barHeight, 2),
                    backgroundColor: chartColor,
                  },
                ]}
              />
              {data.length <= 12 && (
                <ThemedText style={styles.barLabel} numberOfLines={1}>
                  {point.date.slice(5)}
                </ThemedText>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  title: {
    fontSize: 14,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '80%',
    borderRadius: 2,
    minWidth: 4,
  },
  barLabel: {
    fontSize: 8,
    marginTop: 2,
    opacity: 0.5,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    paddingVertical: 40,
  },
});
