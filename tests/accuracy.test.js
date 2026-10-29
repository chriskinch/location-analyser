import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { analyzeTimelineData } from '../analyzer.js';

const PLACE = 'OFFICE';
let dir;
let file;

const visit = startTime => ({ startTime, endTime: startTime, visit: { topCandidate: { placeId: PLACE } } });

beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'accuracy-'));
    file = path.join(dir, 'timeline.json');
    fs.writeFileSync(file, JSON.stringify({ semanticSegments: [
        visit('2026-06-01T09:00:00.000+01:00'),
        visit('2026-06-02T09:00:00.000+01:00'),
        visit('2026-07-07T00:30:00.000+01:00'), // 23:30 UTC on 6 Jul
    ] }));
});

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('manual visited dates', () => {
    it('ignores manual visits outside the analysed range', async () => {
        const r = await analyzeTimelineData(PLACE, '2026-06-01T00:00:00.000Z', '2026-06-30T22:59:00.000Z', null, // 30 Jun 23:59 BST
            JSON.stringify(['2025-01-15', '2026-03-10', '2026-06-03', '2026-07-01']), file);
        expect(r.visitedDates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
        expect(r.totalUniqueVisitDays).toBe(3);
    });
});

// What the browser sends for a UK-local date range during BST (local midnight = 23:00 UTC the day before).
const bst = (date, time) => new Date(`${date}T${time}:00+01:00`).toISOString();

describe('UK local day boundaries', () => {
    it('does not count the day before a BST start date as a working day', async () => {
        const r = await analyzeTimelineData(PLACE, bst('2026-09-02', '00:00'), bst('2026-09-04', '23:59'), null, null, file);
        expect(r.eligibleWorkingDates).toEqual(['2026-09-02', '2026-09-03', '2026-09-04']);
    });

    it('buckets an early-morning BST visit on its UK date', async () => {
        const r = await analyzeTimelineData(PLACE, bst('2026-07-01', '00:00'), bst('2026-07-31', '23:59'), null, null, file);
        expect(r.visitedDates).toEqual(['2026-07-07']);
    });

    it('ignores a manual visit on the day before a BST start date', async () => {
        const r = await analyzeTimelineData(PLACE, bst('2026-06-01', '00:00'), bst('2026-06-30', '23:59'), null,
            JSON.stringify(['2026-05-31', '2026-06-03']), file);
        expect(r.visitedDates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    });

    it('keeps GMT ranges unchanged', async () => {
        const r = await analyzeTimelineData(PLACE, '2026-12-01T00:00:00.000Z', '2026-12-31T23:59:00.000Z', null, null, file);
        expect(r.totalEligibleWorkingDays).toBe(21);
    });
});
