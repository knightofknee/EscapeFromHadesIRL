import { LEVEL_CHECKERS } from '@/lib/habit-scoring';
import { rollingAvgLineColor } from '@/constants/grid';
import { relativeLuminance } from '@/lib/contrast';
import { computeStreak } from '@/lib/habit-streaks';
import {
  computeRates,
  computeMonthlyRates,
  getStatsPageCount,
  chartHasActivity,
  MONTH_LETTERS,
  STATS_DISPLAY_MONTHS,
} from '@/lib/habit-stats';
import type { Habit, HabitRecord } from '@/types/habit';

/**
 * HTML for the Stats PDF export: one row per habit, one column per success
 * level, each cell mirroring that level's stats-screen page (streaks,
 * 7/30/90-day rates, 18-month monthly chart with rolling average). Uses the
 * exact same computations as the screen (lib/habit-stats.ts), so the PDF
 * always matches what the user sees.
 */

const LEVEL_NAMES = ['Basic', 'Goal', 'Ideal'] as const;
const DISPLAY_MONTHS = STATS_DISPLAY_MONTHS;

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Darken a hex color toward black — light line colors need more ink on
 * white paper than they need on the app's cards. */
function shadeForPrint(hex: string): string {
  if (relativeLuminance(hex) <= 0.55) return hex;
  const h = hex.replace('#', '');
  const mix = (c: number) => Math.round(c * 0.72);
  const r = mix(parseInt(h.slice(0, 2), 16));
  const g = mix(parseInt(h.slice(2, 4), 16));
  const b = mix(parseInt(h.slice(4, 6), 16));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/** Inline SVG mirroring StatsChart: monthly bars + rolling-average line. */
function chartSvg(
  data: { date: string; value: number; avg: number }[],
  color: string,
  avgColor: string,
): string {
  const W = 320;
  const H = 132;
  const PLOT = { left: 26, right: 6, top: 8, bottom: 18 };
  const plotW = W - PLOT.left - PLOT.right;
  const plotH = H - PLOT.top - PLOT.bottom;
  const n = Math.max(1, data.length);
  const slot = plotW / n;
  const barW = slot * 0.55;

  const yFor = (pct: number) => PLOT.top + plotH * (1 - Math.min(100, Math.max(0, pct)) / 100);

  const grid = [0, 50, 100]
    .map((pct) => {
      const y = yFor(pct);
      return (
        `<line x1="${PLOT.left}" y1="${y}" x2="${W - PLOT.right}" y2="${y}" stroke="#E5E7EB" stroke-width="1"/>` +
        `<text x="${PLOT.left - 4}" y="${y + 3}" font-size="7" fill="#9CA3AF" text-anchor="end">${pct}%</text>`
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
      return `<text x="${x.toFixed(1)}" y="${H - 6}" font-size="7" fill="#6B7280" text-anchor="middle">${MONTH_LETTERS[month] ?? ''}</text>`;
    })
    .join('');

  // The rolling average is the featured line — the habit color's
  // complement (shaded for print), with a terminal dot + value tag (the
  // current "default setting"), mirroring the in-app chart.
  const hasAvg = chartHasActivity(data);
  let avgLine = '';
  if (hasAvg) {
    avgLine = `<polyline fill="none" stroke="${avgColor}" stroke-width="1.8" points="${data
      .map((d, i) => `${(PLOT.left + i * slot + slot / 2).toFixed(1)},${yFor(d.avg).toFixed(1)}`)
      .join(' ')}"/>`;
    const lastAvg = data[data.length - 1].avg;
    const lx = PLOT.left + (data.length - 1) * slot + slot / 2;
    const ly = yFor(lastAvg);
    const tagY = Math.min(Math.max(ly + 3, PLOT.top + 9), PLOT.top + plotH - 2);
    avgLine +=
      `<circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="2.4" fill="${avgColor}"/>` +
      `<text x="${(lx - 5).toFixed(1)}" y="${tagY.toFixed(1)}" font-size="9" font-weight="700" fill="${avgColor}" text-anchor="end">${Math.round(lastAvg)}%</text>`;
  }

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${grid}${bars}${avgLine}${labels}</svg>`;
}

export function buildStatsHtml(params: {
  habits: Habit[];
  recordIndex: Map<string, HabitRecord>;
  vacationSet: Set<string>;
  winOnlyWeekends: boolean;
}): string {
  const { habits, recordIndex, vacationSet, winOnlyWeekends } = params;

  const habitRows = habits
    .map((habit) => {
      const pageCount = getStatsPageCount(habit);
      const cells = [];
      for (let level = 0; level < pageCount; level++) {
        const checker = LEVEL_CHECKERS[level];
        const { current, longest } = computeStreak(habit, recordIndex, checker, vacationSet, {
          winOnlyWeekends,
        });
        const rates = computeRates(habit, recordIndex, checker, vacationSet, winOnlyWeekends);
        const monthly = computeMonthlyRates(
          habit,
          recordIndex,
          DISPLAY_MONTHS,
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
            ${chartSvg(monthly, habit.color, shadeForPrint(rollingAvgLineColor(habit.color)))}
          </div>`);
      }
      // Pad to 3 columns so cells align into a grid across habit rows.
      while (cells.length < 3) cells.push('<div class="cell empty"></div>');

      return `
        <div class="habit">
          <div class="habit-header">
            <span class="abbr" style="color:${habit.color}">${esc(habit.icon ?? habit.abbreviation)}</span>
            <span class="name">${esc(habit.name)}</span>
          </div>
          <div class="cols">${cells.join('')}</div>
        </div>`;
    })
    .join('');

  const generated = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { margin: 24px; }
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1F2937; margin: 0; }
  h1 { font-size: 18px; margin: 0 0 2px; }
  .meta { font-size: 10px; color: #6B7280; margin-bottom: 14px; }
  .habit { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
  .habit-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
  .abbr { font-size: 16px; font-weight: 800; }
  .name { font-size: 13px; font-weight: 600; }
  .cols { display: flex; gap: 10px; }
  .cell { flex: 1; border: 1px solid #E5E7EB; border-radius: 8px; padding: 8px 8px 4px; }
  .cell.empty { border: none; }
  .level { font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #6B7280; margin-bottom: 4px; }
  .nums { display: flex; gap: 10px; font-size: 9px; color: #4B5563; margin-bottom: 2px; }
  .nums b { font-size: 11px; color: #111827; }
</style>
</head>
<body>
  <h1>Habit Statistics</h1>
  <div class="meta">Generated ${generated} · ${DISPLAY_MONTHS}-month rolling view · bars = monthly completion, line = rolling average</div>
  ${habitRows}
</body>
</html>`;
}
