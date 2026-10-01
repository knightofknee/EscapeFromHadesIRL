/**
 * Starter chores offered on the empty Chores tab (and from Suggestions).
 * Frequencies follow published guidance where it exists, researched
 * 2026-10-01; `source` is the short label shown in the picker. No source =
 * no recognized standard (personal-preference chores like calling family).
 *
 * Sources:
 * - Cleaning Institute: American Cleaning Institute home routine
 *   (cleaninginstitute.org/cleaning-tips/clean-home/home-cleaning-routine):
 *   bathrooms, floors, dusting, fridge clean-out weekly; appliances monthly.
 * - Cleveland Clinic: sheets and towels at least weekly; comforter and
 *   pillows every six months.
 * - USDA: toss perishables from the fridge weekly.
 * - UMD Extension: don't water on a schedule, check soil (weekly check).
 * - ENERGY STAR: check the HVAC filter monthly, replace at least every 3 months.
 * - US Fire Admin (usfa.fema.gov): test smoke alarms monthly, batteries
 *   yearly, replace the whole alarm every 10 years.
 * - NFPA: test CO alarms monthly; clean the dryer vent yearly; NFPA 10
 *   monthly extinguisher gauge check.
 * - First Alert: CO alarms last 7 years.
 * - UF Extension: drain water heater sediment every 3-6 months.
 * - GE / Whirlpool: fridge coils every 6 months.
 * - Good Housekeeping: oven self-clean every 4-6 months.
 * - iCatCare: clumping litter fully replaced at least weekly (non-clumping
 *   every couple of days).
 * - FDA: refresh water and wash pet bowls daily.
 * - CAPC: year-round flea prevention; most products are monthly (follow
 *   the product label).
 * - ADA: replace toothbrush every 3-4 months, sooner if frayed.
 * - NHTSA: check tire pressure monthly, including the spare.
 * - CISA: 3-2-1 backups; no set interval for personal files.
 */
export type ChorePreset = { name: string; emoji: string; frequencyDays: number; source?: string };

export const CHORE_PRESET_GROUPS: { title: string; presets: ChorePreset[] }[] = [
  {
    title: 'Home',
    presets: [
      { name: 'Wash sheets', emoji: '🛏️', frequencyDays: 7, source: 'Cleveland Clinic' },
      { name: 'Laundry', emoji: '🧺', frequencyDays: 7 },
      { name: 'Clean toilet', emoji: '🚽', frequencyDays: 7, source: 'Cleaning Institute' },
      { name: 'Clean shower', emoji: '🚿', frequencyDays: 7, source: 'Cleaning Institute' },
      { name: 'Vacuum', emoji: '🧹', frequencyDays: 7, source: 'Cleaning Institute' },
      { name: 'Mop floors', emoji: '🧽', frequencyDays: 7, source: 'Cleaning Institute' },
      { name: 'Dust', emoji: '🪶', frequencyDays: 7, source: 'Cleaning Institute' },
      { name: 'Wash towels', emoji: '🛁', frequencyDays: 7, source: 'Cleveland Clinic' },
      { name: 'Wash comforter & pillows', emoji: '🛌', frequencyDays: 182, source: 'Cleveland Clinic' },
      { name: 'Take out trash', emoji: '🗑️', frequencyDays: 7 },
      { name: 'Toss old food', emoji: '🥡', frequencyDays: 7, source: 'USDA' },
      { name: 'Wipe down fridge', emoji: '🧊', frequencyDays: 30, source: 'Cleaning Institute' },
      { name: 'Clean fridge coils', emoji: '🌀', frequencyDays: 182, source: 'GE / Whirlpool' },
      { name: 'Clean oven', emoji: '🍳', frequencyDays: 120, source: 'Good Housekeeping' },
      { name: 'Check plants', emoji: '🪴', frequencyDays: 7, source: 'UMD Extension' },
      { name: 'Check air filter', emoji: '🌬️', frequencyDays: 30, source: 'ENERGY STAR' },
      { name: 'Replace air filter', emoji: '🔄', frequencyDays: 90, source: 'ENERGY STAR' },
      { name: 'Drain water heater sediment', emoji: '🚰', frequencyDays: 90, source: 'UF Extension' },
    ],
  },
  {
    title: 'Safety',
    presets: [
      { name: 'Test smoke alarms', emoji: '🚨', frequencyDays: 30, source: 'US Fire Admin' },
      { name: 'Smoke alarm batteries', emoji: '🔋', frequencyDays: 365, source: 'US Fire Admin' },
      { name: 'Replace smoke alarms', emoji: '🏠', frequencyDays: 3652, source: 'US Fire Admin' },
      { name: 'Test CO alarm', emoji: '📟', frequencyDays: 30, source: 'NFPA' },
      { name: 'Replace CO alarm', emoji: '♻️', frequencyDays: 2557, source: 'First Alert' },
      { name: 'Check fire extinguisher', emoji: '🧯', frequencyDays: 30, source: 'NFPA' },
      { name: 'Clean dryer vent', emoji: '🌡️', frequencyDays: 365, source: 'NFPA' },
    ],
  },
  {
    title: 'Pets',
    presets: [
      { name: 'Cat litter', emoji: '🐈', frequencyDays: 7, source: 'iCatCare' },
      { name: 'Cat water', emoji: '💧', frequencyDays: 1, source: 'FDA' },
      { name: 'Wash pet bowls', emoji: '🥣', frequencyDays: 1, source: 'FDA' },
      { name: 'Flea treatment', emoji: '💊', frequencyDays: 30, source: 'CAPC' },
    ],
  },
  {
    title: 'People',
    presets: [
      { name: 'Call mom', emoji: '📞', frequencyDays: 7 },
      { name: 'Call dad', emoji: '☎️', frequencyDays: 7 },
      { name: 'Check in with a friend', emoji: '💬', frequencyDays: 14 },
      { name: 'Call grandparents', emoji: '👵', frequencyDays: 30 },
    ],
  },
  {
    title: 'Self & car',
    presets: [
      { name: 'Replace toothbrush', emoji: '🪥', frequencyDays: 90, source: 'ADA' },
      { name: 'Haircut', emoji: '💈', frequencyDays: 42 },
      { name: 'Wash car', emoji: '🚗', frequencyDays: 14 },
      { name: 'Check tire pressure', emoji: '🛞', frequencyDays: 30, source: 'NHTSA' },
      { name: 'Check photo backup', emoji: '🗂️', frequencyDays: 30 },
    ],
  },
];

/** Quick-pick emojis in the chore editor (any emoji can also be typed). */
export const CHORE_EMOJI_CHOICES = [
  '🧹', '🧺', '🛏️', '🚽', '🚿', '🧽', '🗑️', '🪴', '🍳', '🧊',
  '🐈', '🐕', '💧', '📞', '💬', '🪥', '💈', '🚗', '💊', '📬',
  '🚨', '🧯', '🔋', '✨',
];
