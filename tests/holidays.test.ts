import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readHolidayEntries, holidayDates, mergeHolidays, absencesToHolidays, main, type AbsenceRow } from '../holidays';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'holidays-')); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
const file = (name: string, content?: string) => {
    const p = path.join(dir, name);
    if (content !== undefined) fs.writeFileSync(p, content);
    return p;
};

describe('readHolidayEntries', () => {
    it('returns [] when the file is missing', async () => {
        expect(await readHolidayEntries(file('holidays.json'))).toEqual([]);
    });

    it.each(['', '  \n'])('returns [] for a blank file (%j)', async content => {
        expect(await readHolidayEntries(file('holidays.json', content))).toEqual([]);
    });

    it('reads strings and { date, note } entries', async () => {
        const entries = ['2026-08-14', { date: '2026-09-01', note: 'Dentist' }];
        expect(await readHolidayEntries(file('holidays.json', JSON.stringify(entries)))).toEqual(entries);
    });

    it('throws on malformed JSON or a non-array', async () => {
        await expect(readHolidayEntries(file('a.json', '[oops'))).rejects.toThrow();
        await expect(readHolidayEntries(file('b.json', '{"dates":[]}'))).rejects.toThrow(/JSON array/);
    });
});

describe('holidayDates', () => {
    it('returns unique, sorted dates and skips invalid entries', () => {
        expect(holidayDates([
            '2026-09-01', { date: '2026-08-14', note: 'x' }, '2026-09-01', 'not a date', { note: 'no date' } as never, 42 as never,
        ])).toEqual(['2026-08-14', '2026-09-01']);
    });
});

describe('mergeHolidays', () => {
    it('keeps hand-added entries and notes, adds only new dates, sorts by date', () => {
        const existing = [{ date: '2026-09-01', note: 'hand-added' }, '2026-07-20'];
        const incoming = [{ date: '2026-09-01', note: 'Annual leave' }, { date: '2026-08-14', note: 'Annual leave' }, '2026-08-14'];
        expect(mergeHolidays(existing, incoming)).toEqual([
            '2026-07-20',
            { date: '2026-08-14', note: 'Annual leave' },
            { date: '2026-09-01', note: 'hand-added' },
        ]);
    });

    it('never drops an existing date that the incoming data lacks', () => {
        expect(mergeHolidays(['2026-01-05'], [])).toEqual(['2026-01-05']);
    });

    it('ignores incoming entries without a valid date', () => {
        expect(mergeHolidays([], ['bad', { date: '2026-13' }])).toEqual([]);
    });
});

describe('absencesToHolidays', () => {
    const row = (date: string, requested: number, extra: Partial<AbsenceRow> = {}): AbsenceRow =>
        ({ date, type: 'Vacation', requested, unit: 'Days', status: 'Approved', ...extra });

    it('converts DD/MM/YYYY rows inside the window, any absence type, hours or days', () => {
        expect(absencesToHolidays([
            row('27/10/2026', 7.5, { type: 'Holiday Buy', unit: 'Hours' }),
            row('07/09/2026', 7.5, { type: 'Sickness', unit: 'Hours' }),
            row('03/09/2026', 1),
            row('31/12/2026', 1), // after the window
            row('01/07/2026', 1), // before the window
        ], '2026-07-31', '2026-10-29')).toEqual([
            { date: '2026-09-03', note: 'Workday: Vacation' },
            { date: '2026-09-07', note: 'Workday: Sickness' },
            { date: '2026-10-27', note: 'Workday: Holiday Buy' },
        ]);
    });

    it('nets corrections per date and keeps part days', () => {
        expect(absencesToHolidays([
            row('13/07/2026', 1), row('13/07/2026', -0.5), row('13/07/2026', -0.5),
            row('13/07/2026', 0.5, { type: 'Dependency Leave Paid' }),
            row('02/03/2026', 1), row('02/03/2026', -1), // fully cancelled
        ], '2026-01-01', '2026-12-31')).toEqual([
            { date: '2026-07-13', note: 'Workday: Vacation, Dependency Leave Paid (0.5 day)' },
        ]);
    });

    it('skips rows that are not approved or have a bad date or amount', () => {
        expect(absencesToHolidays([
            row('03/09/2026', 1, { status: 'Submitted' }), row('2026-09-03', 1), row('04/09/2026', NaN),
        ], '2026-01-01', '2026-12-31')).toEqual([]);
    });
});

describe('workday CLI', () => {
    const NOW = new Date('2026-10-29T12:00:00Z');
    const ROWS = JSON.stringify([
        { date: '27/10/2026', type: 'Holiday Buy', requested: 7.5, unit: 'Hours', status: 'Approved' },
        { date: '01/07/2026', type: 'Vacation', requested: 1, unit: 'Days', status: 'Approved' },
    ]);
    beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => vi.restoreAllMocks());

    it('creates holidays.json from the past 90 days when it is missing', async () => {
        const target = file('holidays.json');
        await main(['workday', file('rows.json', ROWS), '90', target], NOW);
        expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual([{ date: '2026-10-27', note: 'Workday: Holiday Buy' }]);
    });

    it('merges into an existing file without dropping hand-added dates', async () => {
        const target = file('holidays.json', '["2026-01-05", {"date": "2026-10-27", "note": "my note"}]');
        await main(['workday', file('rows.json', ROWS), '120', target], NOW);
        expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual([
            '2026-01-05', { date: '2026-07-01', note: 'Workday: Vacation' }, { date: '2026-10-27', note: 'my note' },
        ]);
    });

    it('counts the window in London calendar days across a BST change', async () => {
        // Late on 29 Oct (GMT) the 90-day window starts on 31 Jul (BST); 90 x 24h would land on 1 Aug.
        const target = file('holidays.json');
        const rows = JSON.stringify([{ date: '31/07/2026', type: 'Vacation', requested: 1, unit: 'Days', status: 'Approved' }]);
        await main(['workday', file('rows.json', rows), '90', target], new Date('2026-10-29T23:30:00Z'));
        expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual([{ date: '2026-07-31', note: 'Workday: Vacation' }]);
    });

    it('leaves a malformed holidays.json untouched', async () => {
        const target = file('holidays.json', '[oops');
        await expect(main(['workday', file('rows.json', ROWS), '90', target], NOW)).rejects.toThrow();
        expect(fs.readFileSync(target, 'utf8')).toBe('[oops');
    });

    it('rejects a bad command', async () => {
        await expect(main(['merge', 'x'], NOW)).rejects.toThrow(/Usage/);
    });
});
