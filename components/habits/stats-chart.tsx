import { StyleSheet, View, Platform } from 'react-native';
import { CartesianChart, Bar, Line } from 'victory-native';
import { matchFont } from '@shopify/react-native-skia';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  fontSize: 10,
});

type DataPoint = {
  date: string;
  value: number;
  avg?: number;
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
  const hasAvg = data.some((d) => d.avg != null && d.avg > 0);

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
    avg: d.avg ?? 0,
    month: parseInt(d.date.slice(5), 10) - 1,
  }));

  // Line color: semi-transparent text color for contrast on any bar color
  const lineColor = `${colors.text}90`;

  return (
    <View style={[styles.container, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
      <View style={styles.titleRow}>
        <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
        {hasAvg && (
          <View style={styles.legendRow}>
            <View style={[styles.legendLine, { backgroundColor: lineColor }]} />
            <ThemedText style={[styles.legendText, { color: colors.text }]}>avg</ThemedText>
          </View>
        )}
      </View>
      <View style={{ height }}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={hasAvg ? ['y', 'avg'] : ['y']}
          domainPadding={{ left: 10, right: 10, top: 10 }}
          xAxis={{
            font: axisFont,
            tickCount: data.length,
            formatXLabel: (v) => MONTH_LETTERS[chartData[Math.round(v as number)]?.month ?? 0],
            labelColor: colors.text,
            lineColor: `${colors.text}20`,
          }}
          yAxis={[{
            font: axisFont,
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
            <>
              <Bar
                points={points.y}
                chartBounds={chartBounds}
                color={chartColor}
                roundedCorners={{ topLeft: 3, topRight: 3 }}
              />
              {hasAvg && points.avg && (
                <Line
                  points={points.avg}
                  color={lineColor}
                  strokeWidth={2}
                  curveType="natural"
                />
              )}
            </>
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 14,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendLine: {
    width: 14,
    height: 2,
    borderRadius: 1,
  },
  legendText: {
    fontSize: 10,
    opacity: 0.6,
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    paddingVertical: 40,
  },
});
