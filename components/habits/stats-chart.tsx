import { StyleSheet, View, Platform } from 'react-native';
import { CartesianChart, Bar, Line, useLinePath } from 'victory-native';
import type { PointsArray } from 'victory-native';
import { matchFont, Circle, Path, Skia } from '@shopify/react-native-skia';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { rollingAvgLineColor } from '@/constants/grid';
import { relativeLuminance } from '@/lib/contrast';
import { MONTH_LETTERS, STATS_DISPLAY_MONTHS, chartHasActivity, formatStatValue } from '@/lib/habit-stats';
import { useColorScheme } from '@/hooks/use-color-scheme';

const axisFont = matchFont({
  fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
  fontSize: 10,
});

type DataPoint = {
  date: string;
  value: number;
  avg?: number;
  /** Full-window rolling average (pre-start months count as 0). */
  avgFull?: number;
  /** Months of history through this month; drives the full-window line's weight. */
  months?: number;
};

const RIBBON_MIN = 1.5;
const RIBBON_MAX = 8;

/**
 * The full-window average, drawn as a ribbon whose width grows with the
 * months of history behind each point — the habit solidifying. A stroke
 * can't vary its width along its length, so the smooth path is sampled and
 * offset along its normals into a filled polygon.
 */
function SolidifyingLine({
  points,
  months,
  color,
  solidMonths,
}: {
  points: PointsArray;
  months: number[];
  color: string;
  /** Months of history at which the line reaches full weight: the display
   * window, so a habit with the whole window behind it is solid. */
  solidMonths: number;
}) {
  const { path } = useLinePath(points, { curveType: 'monotoneX' });
  const xs = points.map((p) => p.x);
  const widthAt = (x: number): number => {
    // Interpolate months between the two neighbouring month positions.
    let i = 0;
    while (i < xs.length - 2 && xs[i + 1] < x) i++;
    const span = xs[i + 1] - xs[i] || 1;
    const t = Math.min(1, Math.max(0, (x - xs[i]) / span));
    const m = (months[i] ?? 0) * (1 - t) + (months[i + 1] ?? 0) * t;
    return RIBBON_MIN + (RIBBON_MAX - RIBBON_MIN) * Math.min(1, m / solidMonths);
  };

  const ribbon = Skia.Path.Make();
  const iter = Skia.ContourMeasureIter(path, false, 1);
  const contour = iter.next();
  if (contour) {
    const length = contour.length();
    const steps = Math.max(2, Math.ceil(length / 2));
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const [pos, tan] = contour.getPosTan((length * k) / steps);
      const half = widthAt(pos.x) / 2;
      // Normal = tangent rotated 90°.
      left.push([pos.x - tan.y * half, pos.y + tan.x * half]);
      right.push([pos.x + tan.y * half, pos.y - tan.x * half]);
    }
    ribbon.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left.slice(1)) ribbon.lineTo(x, y);
    for (let k = right.length - 1; k >= 0; k--) ribbon.lineTo(right[k][0], right[k][1]);
    ribbon.close();
  }
  return <Path path={ribbon} color={color} style="fill" />;
}

type StatsChartProps = {
  data: DataPoint[];
  title: string;
  color?: string;
  height?: number;
  /** Axis/tag formatting: completion percentages (default) or raw numeric
   * averages (value-trend habits). */
  format?: 'percent' | 'number';
  /** Months in the chart window; the full-window line is solid once a habit
   * has this many months of history. */
  displayMonths?: number;
};

export function StatsChart({
  data,
  title,
  color,
  height = 200,
  format = 'percent',
  displayMonths = STATS_DISPLAY_MONTHS,
}: StatsChartProps) {
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
    avgFull: d.avgFull ?? 0,
    month: parseInt(d.date.slice(5), 10) - 1,
  }));

  // The current rolling average — the headline number in the header chip.
  const latestAvg = data[data.length - 1]?.avg ?? 0;
  const latestAvgText = format === 'percent' ? `${Math.round(latestAvg)}%` : formatStatValue(latestAvg);
  // The featured line wears the habit color's complement (see grid.ts) so
  // it can never blend into its own bars. Everything that carries the
  // headline number is outlined in near-black so it reads on any bar/card
  // combination; tag ink goes dark on bright line colors (green, cyan,
  // yellow) — white-on-green was unreadable.
  const avgColor = rollingAvgLineColor(chartColor);
  const outline = '#0B0D10';
  const tagInk = relativeLuminance(avgColor) > 0.3 ? outline : '#FFFFFF';
  // The line begins where the habit's history does (see rollingMonthlyAverage);
  // pre-start months would otherwise draw it crawling along the floor.
  const firstActive = Math.max(0, data.findIndex((d) => d.value > 0 || (d.avg ?? 0) > 0));
  const monthsHistory = data.map((d) => d.months ?? 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.tileBackground, borderColor: colors.tileBorder }]}>
      <View style={styles.titleRow}>
        <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
        {hasAvg && (
          <View style={styles.legendRow}>
            <View style={[styles.legendLine, { backgroundColor: avgColor }]} />
            <ThemedText style={[styles.legendText, { color: colors.text }]}>rolling average</ThemedText>
            {/* The headline number lives here, not on the plot, so it never
                covers the curve. */}
            <View style={[styles.legendChip, { backgroundColor: avgColor, borderColor: outline }]}>
              <ThemedText style={[styles.legendValue, { color: tagInk }]}>{latestAvgText}</ThemedText>
            </View>
          </View>
        )}
      </View>
      <View style={{ height }}>
        <CartesianChart
          data={chartData}
          xKey="x"
          yKeys={hasAvg ? ['y', 'avg', 'avgFull'] : ['y']}
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
            formatYLabel: (v) =>
              format === 'percent' ? `${Math.round(v as number)}%` : formatStatValue(v as number),
            labelColor: colors.text,
            lineColor: `${colors.text}20`,
          }]}
          frame={{
            lineColor: `${colors.text}10`,
          }}
        >
          {({ points, chartBounds }) => {
            const featured = points.avg?.slice(firstActive) ?? [];
            const first = featured[0];
            const last = featured[featured.length - 1];
            const showDots = hasAvg && first != null && last != null && typeof last.y === 'number';
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
                {hasAvg && points.avgFull && (
                  /* Full-window average, unlabeled: thickens with months of
                     history and meets the featured line once the whole
                     window has history. */
                  <SolidifyingLine
                    points={points.avgFull}
                    months={monthsHistory}
                    color={`${avgColor}80`}
                    solidMonths={Math.max(1, displayMonths)}
                  />
                )}
                {hasAvg && points.avg && (
                  <>
                    {/* Dark halo under the line cuts a clean channel through
                        the bars; monotone curve never overshoots below 0. */}
                    <Line
                      points={featured}
                      color={outline}
                      strokeWidth={6}
                      strokeCap="round"
                      curveType="monotoneX"
                    />
                    <Line
                      points={featured}
                      color={avgColor}
                      strokeWidth={2.5}
                      strokeCap="round"
                      curveType="monotoneX"
                    />
                  </>
                )}
                {showDots && (
                  <>
                    {/* Where the habit began, and where it stands now. */}
                    <Circle cx={first!.x as number} cy={first!.y as number} r={4} color={outline} />
                    <Circle cx={first!.x as number} cy={first!.y as number} r={2.5} color={avgColor} />
                    <Circle cx={last!.x as number} cy={last!.y as number} r={5.5} color={outline} />
                    <Circle cx={last!.x as number} cy={last!.y as number} r={4} color={avgColor} />
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
  legendChip: {
    marginLeft: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  legendValue: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.5,
    paddingVertical: 40,
  },
});
