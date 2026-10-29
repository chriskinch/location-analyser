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
