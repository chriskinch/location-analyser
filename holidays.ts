import fs from 'fs';
import path from 'path';

// holidays.json (repo root, git-ignored) is a hand-editable list of annual leave days that the
// calendar auto-excludes. Each entry is a "YYYY-MM-DD" string or { "date": "YYYY-MM-DD", "note": "..." }.
export type HolidayEntry = string | { date: string; note?: string };

// Compiled to dist/; the cache file lives at the repo root.
const HOLIDAYS_FILE = path.join(__dirname, '..', 'holidays.json');
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const dateOf = (entry: HolidayEntry) => typeof entry === 'string' ? entry : entry?.date;

// A missing or blank file means no holidays. Malformed JSON throws, so a bad hand edit is reported, not ignored.
async function readHolidayEntries(filePath = HOLIDAYS_FILE): Promise<HolidayEntry[]> {
    let raw: string;
    try {
        raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    if (!raw.trim()) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('holidays.json must contain a JSON array');
    return data;
}

// Unique, sorted YYYY-MM-DD dates; entries without a valid date are skipped.
function holidayDates(entries: HolidayEntry[]): string[] {
    return [...new Set(entries.map(dateOf).filter(d => typeof d === 'string' && DAY.test(d)))].sort();
}

// Keeps every existing entry (hand-added ones and their notes included) and adds incoming dates not already present.
function mergeHolidays(existing: HolidayEntry[], incoming: HolidayEntry[]): HolidayEntry[] {
    const seen = new Set(existing.map(dateOf));
    const added = incoming.filter(e => {
        const d = dateOf(e);
        if (typeof d !== 'string' || !DAY.test(d) || seen.has(d)) return false;
        seen.add(d);
        return true;
    });
    return [...existing, ...added].sort((a, b) => String(dateOf(a)).localeCompare(String(dateOf(b))));
}

// One row of Workday's "My Absence" table, as the sync-holidays skill extracts it.
export interface AbsenceRow {
    date: string; // DD/MM/YYYY
    type: string;
    requested: number; // negative for corrections
    unit: string; // "Days" or "Hours"
    status: string;
}

// ponytail: assumes a 7.5 hour working day, as Workday books it here; make it a parameter if contracts differ.
const HOURS_PER_DAY = 7.5;

// Nets approved absences per date (corrections are negative rows) and keeps dates in [since, until]
// with any time off left, noting the absence types and part days.
function absencesToHolidays(rows: AbsenceRow[], since: string, until: string): HolidayEntry[] {
    const byDate = new Map<string, { days: number; types: Set<string> }>();
    for (const row of rows) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(row.date);
        if (!m || row.status !== 'Approved' || !Number.isFinite(row.requested)) continue;
        const date = `${m[3]}-${m[2]}-${m[1]}`;
        if (date < since || date > until) continue;
        const day = byDate.get(date) ?? { days: 0, types: new Set<string>() };
        day.days += row.unit === 'Hours' ? row.requested / HOURS_PER_DAY : row.requested;
        if (row.requested > 0) day.types.add(row.type);
        byDate.set(date, day);
    }
    return [...byDate].filter(([, d]) => d.days > 1e-9).map(([date, d]) => {
        const part = d.days < 1 - 1e-9 ? ` (${parseFloat(d.days.toFixed(2))} day)` : '';
        return { date, note: `Workday: ${[...d.types].join(', ')}${part}` };
    }).sort((a, b) => a.date.localeCompare(b.date));
}

// Calendar day (YYYY-MM-DD) in UK local time, `daysAgo` calendar days before `now`.
// Takes the London date first and steps whole days in UTC, so a BST change inside the window can't shift it.
function londonDay(now: Date, daysAgo = 0) {
    const day = new Date(`${now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() - daysAgo);
    return day.toISOString().slice(0, 10);
}

// CLI used by the sync-holidays skill: node dist/holidays.js workday <rows.json> [days=90] [holidays.json]
async function main([command, rowsPath, days = '90', filePath = HOLIDAYS_FILE]: string[], now = new Date()) {
    if (command !== 'workday' || !rowsPath || !/^\d+$/.test(days)) {
        throw new Error('Usage: node dist/holidays.js workday <rows.json> [days=90] [holidays.json]');
    }
    const existing = await readHolidayEntries(filePath);
    const rows = JSON.parse(await fs.promises.readFile(rowsPath, 'utf8')) as AbsenceRow[];
    const incoming = absencesToHolidays(rows, londonDay(now, Number(days)), londonDay(now));
    const merged = mergeHolidays(existing, incoming);
    // Write a per-run temp file and rename it over the cache, so a failed write can't truncate hand-added dates.
    // ponytail: no cross-process lock; two overlapping syncs could drop each other's additions. The skill runs
    // one sync at a time by hand, so add a lock file if this ever runs on a schedule or in parallel.
    const tmp = `${filePath}.${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(merged, null, 2) + '\n');
    await fs.promises.rename(tmp, filePath);
    console.log(`Workday: ${incoming.length} day(s) off in the past ${days} days; added ${merged.length - existing.length}; ${filePath} now holds ${merged.length}.`);
}

if (require.main === module) {
    main(process.argv.slice(2)).catch(error => {
        console.error((error as Error).message);
        process.exit(1);
    });
}

export { readHolidayEntries, holidayDates, mergeHolidays, absencesToHolidays, main };
