import { LEVEL_CHECKERS } from '@/lib/habit-scoring';
import { rollingAvgLineColor } from '@/constants/grid';
import { esc, generatedDate, htmlDocument, pdfPalette, shadeForPrint, type PdfPalette, type PdfScheme } from '@/lib/pdf-html';
import { computeStreak } from '@/lib/habit-streaks';
import {
  computeRates,
  computeMonthlyRates,
  computeValueAverages,
  computeMonthlyValueAverages,
  formatStatValue,
  getStatsPageCount,
  isValueTrendHabit,
  chartHasActivity,
  MONTH_LETTERS,
  STATS_DISPLAY_MONTHS,
  type MonthlyPoint,
} from '@/lib/habit-stats';
import type { Habit, HabitRecord } from '@/types/habit';

/**
 * HTML for the Stats PDF export, laid out for a phone: each habit, then one
 * card per success level stacked under it, each card mirroring that level's
 * stats-screen page (streaks,
 * 7/30/90-day rates, monthly chart with rolling average over the months
 * window chosen on the screen). Uses the exact same computations as the
 * screen (lib/habit-stats.ts), so the PDF always matches what the user sees.
 */

const LEVEL_NAMES = ['Basic', 'Goal', 'Ideal'] as const;

/** Round up to a clean axis ceiling (1/2/2.5/5/10 × power of ten). */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const scaled = n / pow;
  const nice = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 2.5 ? 2.5 : scaled <= 5 ? 5 : 10;
  return nice * pow;
}

/** Inline SVG mirroring StatsChart: monthly bars + rolling-average line.
 * Percent charts use the fixed 0-100 scale; value-trend charts scale to the
 * data and label the axis in raw units. */
function chartSvg(
  data: MonthlyPoint[],
  color: string,
  avgColor: string,
  percent: boolean,
  palette: PdfPalette,
  displayMonths: number,
): string {
  const W = 360;
  const H = 140;
  const PLOT = { left: 26, right: 6, top: 8, bottom: 18 };
  const plotW = W - PLOT.left - PLOT.right;
  const plotH = H - PLOT.top - PLOT.bottom;
  const n = Math.max(1, data.length);
  const slot = plotW / n;
  const barW = slot * 0.55;

  const maxY = percent ? 100 : niceCeil(Math.max(...data.map((d) => Math.max(d.value, d.avg, d.avgFull)), 0));
  const axisLabel = (v: number) => (percent ? `${Math.round(v)}%` : formatStatValue(v));

  const yFor = (v: number) => PLOT.top + plotH * (1 - Math.min(maxY, Math.max(0, v)) / maxY);

  const grid = [0, maxY / 2, maxY]
    .map((val) => {
      const y = yFor(val);
      return (
        `<line x1="${PLOT.left}" y1="${y}" x2="${W - PLOT.right}" y2="${y}" stroke="${palette.line}" stroke-width="1"/>` +
        `<text x="${PLOT.left - 4}" y="${y + 3}" font-size="7" fill="${palette.faint}" text-anchor="end">${axisLabel(val)}</text>`
      );
    })
    .join('');

  const bars = data
    .map((d, i) => {
      const x = PLOT.left + i * slot + (slot - barW) / 2;
      const y = yFor(d.value);
      const h = PLOT.top + plotH - y;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${color}" rx="1"/>`;
    })
    .join('');

  const labels = data
    .map((d, i) => {
      const month = parseInt(d.date.slice(5), 10) - 1;
      const x = PLOT.left + i * slot + slot / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 6}" font-size="7" fill="${palette.muted}" text-anchor="middle">${MONTH_LETTERS[month] ?? ''}</text>`;
    })
    .join('');

  // The rolling average is the featured line — the habit color's
  // complement (shaded for print), with a terminal dot + value tag (the
  // current "default setting"), mirroring the in-app chart.
  const hasAvg = chartHasActivity(data);
  let avgLine = '';
  if (hasAvg) {
    // Full-window average first (thin, unlabeled), then the featured line,
    // which starts at the habit's first active month — like the in-app chart.
    // Print can't taper a stroke; the full-window line's weight is the
    // habit's months of history at the window's end (screen: per point).
    const fullW = 0.6 + 3.4 * Math.min(1, (data[data.length - 1].months ?? 0) / displayMonths);
    avgLine = `<polyline fill="none" stroke="${avgColor}" stroke-opacity="0.5" stroke-width="${fullW.toFixed(1)}" points="${data
      .map((d, i) => `${(PLOT.left + i * slot + slot / 2).toFixed(1)},${yFor(d.avgFull).toFixed(1)}`)
      .join(' ')}"/>`;
    const firstActive = Math.max(0, data.findIndex((d) => d.value > 0 || d.avg > 0));
    avgLine += `<polyline fill="none" stroke="${avgColor}" stroke-width="1.8" points="${data
      .slice(firstActive)
      .map((d, i) => `${(PLOT.left + (i + firstActive) * slot + slot / 2).toFixed(1)},${yFor(d.avg).toFixed(1)}`)
      .join(' ')}"/>`;
    const lastAvg = data[data.length - 1].avg;
    const lx = PLOT.left + (data.length - 1) * slot + slot / 2;
    const ly = yFor(lastAvg);
    const tagY = Math.min(Math.max(ly + 3, PLOT.top + 9), PLOT.top + plotH - 2);
    const tagText = percent ? `${Math.round(lastAvg)}%` : formatStatValue(lastAvg);
    avgLine +=
      `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.4" fill="${avgColor}"/>` +
      `<text x="${(lx - 5).toFixed(1)}" y="${tagY.toFixed(1)}" font-size="9" font-weight="700" fill="${avgColor}" text-anchor="end">${tagText}</text>`;
  }

  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${grid}${bars}${avgLine}${labels}</svg>`;
}

export function buildStatsHtml(params: {
  habits: Habit[];
  recordIndex: Map<string, HabitRecord>;
  vacationSet: Set<string>;
  winOnlyWeekends: boolean;
  /** The app's theme: the PDF looks like the user's phone. */
  scheme: PdfScheme;
  /** Months in the chart window, as chosen on the Stats screen. */
  displayMonths?: number;
}): string {
  const { habits, recordIndex, vacationSet, winOnlyWeekends, scheme } = params;
  const displayMonths = Math.max(1, params.displayMonths ?? STATS_DISPLAY_MONTHS);
  const palette = pdfPalette(scheme);

  const habitRows = habits
    .map((habit) => {
      const pageCount = getStatsPageCount(habit);
      const cells = [];
      if (isValueTrendHabit(habit)) {
        // Value habits chart the numeric trend (avg per day), not completion
        // rate — one cell, streaks keep the "any entry counts" reading.
        const { current, longest } = computeStreak(habit, recordIndex, LEVEL_CHECKERS[0], vacationSet, {
          winOnlyWeekends,
        });
        const avgs = computeValueAverages(habit, recordIndex, vacationSet, winOnlyWeekends);
        const monthly = computeMonthlyValueAverages(
          habit,
          recordIndex,
          displayMonths,
          vacationSet,
          winOnlyWeekends,
        );
        cells.push(`
          <div class="cell">
            <div class="level">Average Per Day</div>
            <div class="nums">
              <span><b>${current}</b> streak</span>
              <span><b>${longest}</b> longest</span>
            </div>
            <div class="nums rates">
              <span>7d <b>${formatStatValue(avgs.week)}</b></span>
              <span>30d <b>${formatStatValue(avgs.month)}</b></span>
              <span>90d <b>${formatStatValue(avgs.quarter)}</b></span>
            </div>
            ${chartSvg(monthly, habit.color, shadeForPrint(rollingAvgLineColor(habit.color), scheme), false, palette, displayMonths)}
          </div>`);
      } else {
        for (let level = 0; level < pageCount; level++) {
          const checker = LEVEL_CHECKERS[level];
          const { current, longest } = computeStreak(habit, recordIndex, checker, vacationSet, {
            winOnlyWeekends,
          });
          const rates = computeRates(habit, recordIndex, checker, vacationSet, winOnlyWeekends);
          const monthly = computeMonthlyRates(
            habit,
            recordIndex,
            displayMonths,
            checker,
            vacationSet,
            winOnlyWeekends,
          );
          cells.push(`
          <div class="cell">
            <div class="level">${LEVEL_NAMES[level]}</div>
            <div class="nums">
              <span><b>${current}</b> streak</span>
              <span><b>${longest}</b> longest</span>
            </div>
            <div class="nums rates">
              <span>7d <b>${rates.week}%</b></span>
              <span>30d <b>${rates.month}%</b></span>
              <span>90d <b>${rates.quarter}%</b></span>
            </div>
            ${chartSvg(monthly, habit.color, shadeForPrint(rollingAvgLineColor(habit.color), scheme), true, palette, displayMonths)}
          </div>`);
        }
      }
      // The habit's name glued to its first card: iOS ignores break-after.
      return `
        <div class="habit">
          <div class="u">
            <div class="habit-header">
              <span class="abbr" style="color:${habit.color}">${esc(habit.icon ?? habit.abbreviation)}</span>
              <span class="name">${esc(habit.name)}</span>
            </div>
            ${cells[0] ?? ''}
          </div>
          ${cells.slice(1).map((cell) => `<div class="u">${cell}</div>`).join('')}
        </div>`;
    })
    .join('');

  return htmlDocument(
    `
  .habit > .u:first-child { padding-top: 22px; }
  .habits > .habit:first-child > .u:first-child { padding-top: 0; }
  .habit-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; break-after: avoid; page-break-after: avoid; }
  .abbr { font-size: 20px; font-weight: 800; }
  .name { font-size: 16px; font-weight: 600; }
  .cell { border: 1px solid var(--line); background: ${palette.app.tileBackground}; border-radius: 10px; padding: 10px 10px 6px; }
  .level { font-size: 10px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
  .nums { display: flex; gap: 14px; font-size: 11px; color: var(--mid); margin-bottom: 4px; }
  .nums b { font-size: 14px; color: var(--strong); }`,
    `<h1>Habit Statistics</h1>
  <div class="meta">Generated ${generatedDate()} · ${displayMonths}-month rolling view<br/>Bars are monthly completion (avg per day for value habits), the line is the rolling average.</div>
  <div class="habits">${habitRows}</div>`,
    palette,
  );
}
