import { StyleSheet, View } from 'react-native';
import { CartesianChart, Bar } from 'victory-native';
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
      <View style={[styles.container, { height: height + 50, backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
        <ThemedText style={styles.emptyText}>No data yet</ThemedText>
      </View>
    );
  }

  const chartData = data.map((d, i) => ({
    x: i,
    y: d.value,
    label: d.date.slice(5),
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
      <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
      <View style={{ height }}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={['y']}
          domainPadding={{ left: 10, right: 10, top: 10 }}
          xAxis={{
            font: null,
            tickCount: 0,
            lineColor: `${colors.text}20`,
          }}
          yAxis={[{
            font: null,
            tickCount: 4,
            formatYLabel: (v) => `${Math.round(v as number)}%`,
            labelColor: colors.text,
            lineColor: `${colors.text}20`,
          }]}
          frame={{
            lineColor: `${colors.text}10`,
          }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.y}
              chartBounds={chartBounds}
              color={chartColor}
              roundedCorners={{ topLeft: 3, topRight: 3 }}
            />
          )}
        </CartesianChart>
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
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    paddingVertical: 40,
  },
});
