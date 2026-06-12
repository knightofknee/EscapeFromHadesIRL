import { StyleSheet, View, Platform } from 'react-native';
import { CartesianChart, Bar, Line } from 'victory-native';
import { matchFont, Circle, RoundedRect, Text as SkText } from '@shopify/react-native-skia';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { rollingAvgLineColor } from '@/constants/grid';
import { readableTextOn } from '@/lib/contrast';
import { MONTH_LETTERS, chartHasActivity } from '@/lib/habit-stats';
import { useColorScheme } from '@/hooks/use-color-scheme';

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  fontSize: 10,
});

const badgeFont = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  fontSize: 11,
  fontWeight: 'bold',
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
  const hasAvg = chartHasActivity(data);

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

  // The current rolling average — the headline number the line tag shows.
  const latestAvg = data[data.length - 1]?.avg ?? 0;
  // The featured line wears the habit color's complement (see grid.ts) so
  // it can never blend into its own bars; tag ink adapts for legibility.
  const avgColor = rollingAvgLineColor(chartColor);
  const tagInk = readableTextOn(avgColor) === '#000000' ? '#1F2937' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
      <View style={styles.titleRow}>
        <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
        {hasAvg && (
          <View style={styles.legendRow}>
            <View style={[styles.legendLine, { backgroundColor: avgColor }]} />
            <ThemedText style={[styles.legendText, { color: colors.text }]}>rolling average</ThemedText>
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
          {({ points, chartBounds }) => {
            // Stock-chart style terminal tag on the rolling-average line:
            // a dot on the last point plus a gold pill with the current
            // value — the "current default setting", featured.
            const last = points.avg?.[points.avg.length - 1];
            const showTag = hasAvg && last != null && typeof last.y === 'number';
            const tagText = `${Math.round(latestAvg)}%`;
            const textW = badgeFont.measureText(tagText).width;
            const padH = 5;
            const pillW = textW + padH * 2;
            const pillH = 17;
            const lastX = showTag ? (last!.x as number) : 0;
            const lastY = showTag ? (last!.y as number) : 0;
            const pillX = Math.min(lastX + 7, chartBounds.right - pillW - 2);
            const pillY = Math.min(
              Math.max(lastY - pillH / 2, chartBounds.top + 2),
              chartBounds.bottom - pillH - 2,
            );
            return (
              <>
                {/* Bars carry the month-to-month noise — dimmed so the
                    rolling-average line reads as the headline signal. */}
                <Bar
                  points={points.y}
                  chartBounds={chartBounds}
                  color={hasAvg ? `${chartColor}99` : chartColor}
                  roundedCorners={{ topLeft: 3, topRight: 3 }}
                />
                {hasAvg && points.avg && (
                  <Line
                    points={points.avg}
                    color={avgColor}
                    strokeWidth={2.5}
                    curveType="natural"
                  />
                )}
                {showTag && (
                  <>
                    <Circle cx={lastX} cy={lastY} r={3.5} color={avgColor} />
                    <RoundedRect x={pillX} y={pillY} width={pillW} height={pillH} r={pillH / 2} color={avgColor} />
                    <SkText
                      x={pillX + padH}
                      y={pillY + pillH / 2 + 4}
                      text={tagText}
                      font={badgeFont}
                      color={tagInk}
                    />
                  </>
                )}
              </>
            );
          }}
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
