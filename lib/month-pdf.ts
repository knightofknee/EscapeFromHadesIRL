import { readableTextOn } from '@/lib/contrast';
import { addDays, formatDate } from '@/lib/date-utils';
import { computeDayBreakdown, heatmapShade } from '@/lib/day-breakdown';
import { recordLevel } from '@/lib/habit-scoring';
import {
  computeMonthRows,
  formatMonthAmount,
  monthCalendarWeeks,
  monthCountDays,
  type MonthHabitStats,
} from '@/lib/month-habit-stats';
import { esc, generatedDate, htmlDocument, pdfPalette, type PdfPalette, type PdfScheme } from '@/lib/pdf-html';
import { monotoneCurvePath, smoothSeries } from '@/lib/sparkline';
import type { SuccessColors } from '@/hooks/use-success-colors';
import type { Habit, HabitRecord, VacationDay } from '@/types/habit';

/**
 * HTML for the Month view's shareable PDF, laid out for a phone: the newest
 * month's calendar heatmap and Habit Completion cards (the same numbers as
 * the screen, via lib/month-habit-stats + lib/day-breakdown), optionally the
 * last 4 weeks of the week view, then any older months. With more than one
 * month, every month's cards carry a small month tag so a reader scrolling
 * the middle of the file always knows which month they're in.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SHORT_MONTHS = MONTH_NAMES.map((m) => m.slice(0, 3));
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const REPORT_WEEKS = 4;

export type MonthReportOptions = {
  /** The newest month in the report (the one on screen). */
  year: number;
  month: number;
  /** 1 = just that month; more adds the months before it, newest first. */
  monthCount: number;
  includeWeeks: boolean;
};

type YM = { year: number; month: number };

function monthsOf({ year, month, monthCount }: MonthReportOptions): YM[] {
  return Array.from({ length: Math.max(1, monthCount) }, (_, i) => {
    const d = new Date(year, month - i, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
}

/** Mondays of the report's weeks, newest first: the weeks up to the newest month's end (or today, if sooner). */
function weekStarts(opts: MonthReportOptions, today: Date): string[] {
  const monthEnd = new Date(opts.year, opts.month + 1, 0);
  const anchor = monthEnd < today ? monthEnd : today;
  const monday = addDays(formatDate(anchor), -((anchor.getDay() + 6) % 7));
  return Array.from({ length: REPORT_WEEKS }, (_, i) => addDays(monday, -7 * i));
}

/** The date span the report reads records from. */
export function monthReportRange(opts: MonthReportOptions, today: Date): { startDate: string; endDate: string } {
  const months = monthsOf(opts);
  const oldest = months[months.length - 1];
  let startDate = formatDate(new Date(oldest.year, oldest.month, 1));
  let endDate = formatDate(new Date(opts.year, opts.month + 1, 0));
  if (opts.includeWeeks) {
    const weeks = weekStarts(opts, today);
    const first = weeks[weeks.length - 1];
    const last = addDays(weeks[0], 6);
    if (first < startDate) startDate = first;
    if (last > endDate) endDate = last;
  }
  return { startDate, endDate };
}

/** "October 2026", or "Aug – Oct 2026" / "Nov 2025 – Oct 2026" for several months. */
export function monthReportLabel(opts: MonthReportOptions): string {
  const months = monthsOf(opts);
  const newest = months[0];
  if (months.length === 1) return `${MONTH_NAMES[newest.month]} ${newest.year}`;
  const oldest = months[months.length - 1];
  const from =
    oldest.year === newest.year
      ? SHORT_MONTHS[oldest.month]
      : `${SHORT_MONTHS[oldest.month]} ${oldest.year}`;
  return `${from} – ${SHORT_MONTHS[newest.month]} ${newest.year}`;
}

/** The month row's sparkline (components/habits/month-sparkline.tsx), as inline SVG. */
function sparklineSvg(color: string, stats: MonthHabitStats, daysInMonth: number, palette: PdfPalette): string {
  const W = 360;
  const H = 44;
  const pad = 3;
  const plotH = H - pad * 2;
  const { series, yMax } = stats;
  const xFor = (day: number) => pad + ((day - 1) / Math.max(1, daysInMonth - 1)) * (W - pad * 2);
  const yFor = (y: number) => pad + plotH - (yMax > 0 ? Math.min(1, y / yMax) : 0) * plotH;
  const fitted = smoothSeries(series.map((p) => ({ x: p.day, y: p.y })), 1);
  const screen = fitted.map((p) => ({ x: xFor(p.x), y: yFor(p.y) }));
  const line = monotoneCurvePath(screen);
  const baseY = pad + plotH;
  // A flat translucent fill, not the screen's fading gradient: the iOS PDF
  // renderer ignores stop-opacity and paints the gradient solid.
  let svg = `<line x1="${pad}" y1="${baseY}" x2="${W - pad}" y2="${baseY}" stroke="${palette.app.tileUnrecorded}" stroke-width="1"/>`;
  if (screen.length > 1) {
    const last = screen[screen.length - 1];
    svg += `<path d="${line} L${last.x},${baseY} L${screen[0].x},${baseY} Z" fill="${color}" fill-opacity="0.15"/>`;
  }
  for (const p of series) {
    svg += `<circle cx="${xFor(p.day).toFixed(1)}" cy="${yFor(p.y).toFixed(1)}" r="1.6" fill="${color}" opacity="0.35"/>`;
  }
  if (screen.length > 1) {
    svg += `<path d="${line}" stroke="${color}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (screen.length > 0) {
    const last = screen[screen.length - 1];
    svg += `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="2.8" fill="${color}"/>`;
  }
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
}

type ReportData = {
  habits: Habit[];
  recordIndex: Map<string, HabitRecord>;
  vacationDays: Map<string, VacationDay>;
  winOnlyWeekends: boolean;
  /** The success colors of the app's current theme (`scheme`). */
  successColors: SuccessColors;
  today: Date;
  /** The app's theme: the PDF looks like the user's phone. */
  scheme: PdfScheme;
};

function monthSection(data: ReportData, { year, month }: YM, tagged: boolean, palette: PdfPalette): string {
  const { habits, recordIndex, vacationDays, winOnlyWeekends, today } = data;
  const vacationSet = new Set(vacationDays.keys());
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tag = tagged ? `<span class="tag">${SHORT_MONTHS[month]} ${year}</span>` : '';

  const cells = monthCalendarWeeks(year, month)
    .flat()
    .map((day) => {
      if (!day) return '<div class="day"></div>';
      const dateStr = formatDate(new Date(year, month, day));
      const vacation = vacationDays.get(dateStr);
      if (vacation) {
        const initial = (vacation.label.trim() || 'V')[0];
        return `<div class="day" style="background:${vacation.color};color:${readableTextOn(vacation.color)};font-weight:700">${esc(initial)}</div>`;
      }
      const ratio =
        habits.length === 0
          ? 0
          : computeDayBreakdown(habits, dateStr, (h) => recordIndex.get(`${h.id}_${dateStr}`), winOnlyWeekends)
              .ratio;
      return `<div class="day" style="background:${heatmapShade(ratio, palette.app.tileRecorded, palette.app.tileUnrecorded)}">${day}</div>`;
    })
    .join('');

  const calendar = `
    <div class="card calendar">
      ${tagged ? `<div class="card-top"><span></span>${tag}</div>` : ''}
      <div class="grid">${DAY_NAMES.map((d) => `<div class="wd">${d[0]}</div>`).join('')}${cells}</div>
    </div>`;

  const countDays = monthCountDays(year, month, today);
  const rows = computeMonthRows(habits, recordIndex, year, month, countDays, vacationSet, winOnlyWeekends)
    .map((row) => {
      const { habit, completed, activeDays, rate, amount } = row;
      const trio = amount
        ? `<div class="trio">
            <div class="amt"><b>${formatMonthAmount(amount, amount.average)}</b><span>avg/day</span></div>
            ${amount.showMedian ? `<div class="amt"><b>${formatMonthAmount(amount, amount.median)}</b><span>median</span></div>` : ''}
            <div class="amt"><b>${formatMonthAmount(amount, amount.total)}</b><span>total</span></div>
          </div>`
        : '';
      return `
        <div class="card habit">
          <div class="card-top">
            <span class="hname"><span class="abbr" style="color:${habit.color}">${esc(habit.icon ?? habit.abbreviation)}</span>${esc(habit.name)}</span>
            ${tag}
          </div>
          <div class="hstats">
            <div><div class="rate">${rate == null ? '—' : `${rate}%`}</div><div class="count">${completed}/${activeDays} days</div></div>
            ${trio}
          </div>
          ${sparklineSvg(habit.color, row, daysInMonth, palette)}
        </div>`;
    });

  return `
    <section>
      ${keepWithNext(tagged ? `<div class="divider"><span>${MONTH_NAMES[month]} ${year}</span></div>` : '', calendar)}
      ${keepWithNext('<div class="section-title">Habit Completion</div>', rows[0] ?? '')}
      ${rows.slice(1).map(unit).join('')}
    </section>`;
}

/** One block that never splits across pages (`.u` in lib/pdf-html). */
function unit(block: string): string {
  return `<div class="u">${block}</div>`;
}

/**
 * A heading glued to the block after it. iOS's PDF renderer ignores
 * break-after: avoid, which strands headings at the bottom of a page; one
 * unbreakable wrapper around both keeps them together.
 */
function keepWithNext(heading: string, block: string): string {
  return unit(`${heading}${block}`);
}

function weekCard(data: ReportData, monday: string): string {
  const { habits, recordIndex, vacationDays, successColors } = data;
  const byLevel = [successColors.unrecorded, successColors.recorded, successColors.double, successColors.triple];
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const short = (s: string) => `${SHORT_MONTHS[Number(s.slice(5, 7)) - 1]} ${Number(s.slice(8))}`;
  const columns = dates
    .map((dateStr, i) => {
      const vacation = vacationDays.get(dateStr);
      const tiles = vacation
        ? `<div class="vac" style="background:${vacation.color};color:${readableTextOn(vacation.color)}">${esc(vacation.label.trim() || 'V')}</div>`
        : habits
            .map((habit) => {
              const bg = byLevel[recordLevel(habit, recordIndex.get(`${habit.id}_${dateStr}`))] ?? successColors.unrecorded;
              return `<div class="tile" style="background:${bg};color:${readableTextOn(bg)}">${esc(habit.icon ?? habit.abbreviation)}</div>`;
            })
            .join('');
      return `<div class="col"><div class="colhead"><div>${DAY_NAMES[i]}</div><b>${Number(dateStr.slice(8))}</b></div>${tiles}</div>`;
    })
    .join('');
  return `
    <div class="card week">
      <div class="week-label">${short(dates[0])} – ${short(dates[6])}</div>
      <div class="cols">${columns}</div>
    </div>`;
}

export function buildMonthReportHtml(data: ReportData, opts: MonthReportOptions): string {
  const months = monthsOf(opts);
  const tagged = months.length > 1;
  const palette = pdfPalette(data.scheme);
  const sections = months.map((ym) => monthSection(data, ym, tagged, palette));
  if (opts.includeWeeks) {
    const weeks = weekStarts(opts, data.today).map((monday) => weekCard(data, monday));
    // Right after the newest month: it's the recent detail behind it.
    sections.splice(
      1,
      0,
      `<section>${keepWithNext(`<div class="section-title">Last ${REPORT_WEEKS} Weeks</div>`, weeks[0])}${weeks.slice(1).map(unit).join('')}</section>`,
    );
  }

  return htmlDocument(
    `
  section { margin-bottom: 18px; }
  .card { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
  .card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .tag { font-size: 9px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase; color: var(--muted); background: var(--chip); border-radius: 999px; padding: 2px 7px; white-space: nowrap; }
  .divider { display: flex; align-items: center; gap: 10px; margin: 6px 0 10px; break-after: avoid; page-break-after: avoid; }
  .divider::before, .divider::after { content: ''; flex: 1; height: 1px; background: var(--line); }
  .divider span { font-size: 13px; font-weight: 700; color: var(--muted); letter-spacing: 0.5px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .wd { text-align: center; font-size: 11px; font-weight: 600; color: var(--muted); padding-bottom: 2px; }
  .day { aspect-ratio: 1; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; }
  .section-title { font-size: 16px; font-weight: 700; margin: 8px 0 8px; break-after: avoid; page-break-after: avoid; }
  .hname { font-size: 14px; display: flex; align-items: center; gap: 8px; }
  .abbr { font-size: 16px; font-weight: 700; }
  .hstats { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin-bottom: 4px; }
  .rate { font-size: 22px; font-weight: 700; }
  .count { font-size: 12px; color: var(--muted); }
  .trio { display: flex; gap: 16px; }
  .amt { text-align: right; }
  .amt b { display: block; font-size: 16px; }
  .amt span { font-size: 10px; color: var(--muted); }
  .week-label { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .cols { display: flex; gap: 3px; background: ${palette.app.gridBackground}; border-radius: 8px; padding: 4px; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .colhead { text-align: center; font-size: 10px; font-weight: 600; padding-bottom: 3px; margin-bottom: 1px; border-bottom: 1px solid rgba(128,128,128,0.2); width: 100%; }
  .colhead b { display: block; font-size: 12px; font-weight: 500; }
  .tile { width: 90%; border-radius: 4px; padding: 3px 1px; text-align: center; font-size: 9px; font-weight: 700; white-space: nowrap; overflow: hidden; }
  .vac { width: 90%; min-height: 56px; border-radius: 4px; padding: 6px 3px; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 12px; font-weight: 700; word-break: break-word; }`,
    `<h1>${esc(monthReportLabel(opts))}</h1>
  <div class="meta">Habit month · Generated ${generatedDate(data.today)}</div>
  ${sections.join('')}`,
    palette,
  );
}
