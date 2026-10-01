import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { monotoneCurvePath, smoothSeries } from '@/lib/sparkline';

type Props = {
  /** Unique per row: scopes the SVG gradient id. */
  id: string;
  color: string;
  /** Counted days only (see computeMonthHabitStats), oldest first. */
  series: { day: number; y: number }[];
  yMax: number;
  /** The x axis always spans the whole month, so the line grows across it. */
  daysInMonth: number;
  baselineColor: string;
  height?: number;
};

/**
 * One habit's month as a smoothed curve: faint dots are the raw days, the
 * line is the best-fit curve through them (lib/sparkline.ts has the math).
 */
export function MonthSparkline({ id, color, series, yMax, daysInMonth, baselineColor, height = 40 }: Props) {
  const [width, setWidth] = useState(0);
  const pad = 3;
  const plotH = height - pad * 2;
  const xFor = (day: number) =>
    pad + ((day - 1) / Math.max(1, daysInMonth - 1)) * (width - pad * 2);
  const yFor = (y: number) => pad + plotH - (yMax > 0 ? Math.min(1, y / yMax) : 0) * plotH;

  const fitted = smoothSeries(series.map((p) => ({ x: p.day, y: p.y })), 1);
  const screen = fitted.map((p) => ({ x: xFor(p.x), y: yFor(p.y) }));
  const line = monotoneCurvePath(screen);
  const baseY = pad + plotH;
  const area =
    screen.length > 1
      ? `${line} L${screen[screen.length - 1].x},${baseY} L${screen[0].x},${baseY} Z`
      : '';
  const gradientId = `spark-${id}`;

  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Line x1={pad} y1={baseY} x2={width - pad} y2={baseY} stroke={baselineColor} strokeWidth={1} />
          {area ? <Path d={area} fill={`url(#${gradientId})`} /> : null}
          {series.map((p) => (
            <Circle key={p.day} cx={xFor(p.day)} cy={yFor(p.y)} r={1.6} fill={color} opacity={0.35} />
          ))}
          {screen.length > 1 ? (
            <Path
              d={line}
              stroke={color}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
          {screen.length > 0 ? (
            <Circle cx={screen[screen.length - 1].x} cy={screen[screen.length - 1].y} r={2.8} fill={color} />
          ) : null}
        </Svg>
      )}
    </View>
  );
}
