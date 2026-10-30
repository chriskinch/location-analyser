// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest';

// Import the utilities exported by frontend.ts.
// The DOMContentLoaded callback at the bottom of frontend.ts will not fire
// automatically during import since jsdom's document is already parsed.
import { debounce, CalendarRenderer, DateRangePicker } from '../frontend';

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('delays execution until after the wait period', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 200);

        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('only executes once after multiple rapid calls', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 300);

        debounced();
        debounced();
        debounced();
        vi.advanceTimersByTime(300);

        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets the timer on each call', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 300);

        debounced();
        vi.advanceTimersByTime(200);
        debounced(); // reset
        vi.advanceTimersByTime(200);

        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes arguments to the wrapped function', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced('hello', 42);
        vi.advanceTimersByTime(100);

        expect(fn).toHaveBeenCalledWith('hello', 42);
    });
});

describe('CalendarRenderer.formatDateToYYYYMMDD', () => {
    let renderer: CalendarRenderer;

    beforeEach(() => {
        // CalendarRenderer constructor calls document.getElementById and then render(),
        // so we need a container element in the DOM.
        document.body.innerHTML = '<div id="cal"></div>';
        renderer = new CalendarRenderer('cal', null);
    });

    it('formats a standard date using local time', () => {
        // Use a fixed local date (not UTC) since this method uses getFullYear/getMonth/getDate
        const date = new Date(2024, 5, 15); // June 15 2024 local
        expect(renderer.formatDateToYYYYMMDD(date)).toBe('2024-06-15');
    });

    it('pads single-digit month', () => {
        const date = new Date(2024, 0, 5); // January 5 2024 local
        expect(renderer.formatDateToYYYYMMDD(date)).toBe('2024-01-05');
    });

    it('pads single-digit day', () => {
        const date = new Date(2024, 11, 3); // December 3 2024 local
        expect(renderer.formatDateToYYYYMMDD(date)).toBe('2024-12-03');
    });
});

describe('CalendarRenderer.goToToday', () => {
    it('returns the calendar to the current month', () => {
        document.body.innerHTML = '<div id="cal"></div>';
        const renderer = new CalendarRenderer('cal', null);
        renderer.changeMonth(-3);
        renderer.goToToday();
        const now = new Date();
        expect(renderer.currentMonth.getFullYear()).toBe(now.getFullYear());
        expect(renderer.currentMonth.getMonth()).toBe(now.getMonth());
        expect(document.querySelector('.calendar-header h3')!.textContent)
            .toBe(now.toLocaleString('default', { month: 'long', year: 'numeric' }));
    });
});

describe('DateRangePicker.formatDateForInput', () => {
    let picker: DateRangePicker;

    beforeEach(() => {
        // DateRangePicker constructor creates shadow DOM with input elements
        document.body.innerHTML = '<date-range-picker id="picker"></date-range-picker>';
        picker = document.getElementById('picker') as DateRangePicker;
    });

    it('formats a standard date', () => {
        const date = new Date(2024, 5, 15); // June 15 2024 local
        expect(picker.formatDateForInput(date)).toBe('2024-06-15');
    });

    it('pads single-digit month', () => {
        const date = new Date(2024, 0, 20); // January 20 2024 local
        expect(picker.formatDateForInput(date)).toBe('2024-01-20');
    });

    it('pads single-digit day', () => {
        const date = new Date(2024, 11, 3); // December 3 2024 local
        expect(picker.formatDateForInput(date)).toBe('2024-12-03');
    });
});

describe('timeline file upload handler', () => {
    // Full DOM required so the DOMContentLoaded handler can wire up all elements.
    // The listener was registered once on module import; dispatching the event
    // manually re-runs it against the freshly set up DOM.
    const FULL_DOM = `
        <input type="file" id="timelineFileInput" accept=".json">
        <span id="uploadStatus"></span>
        <input type="text" id="placeIdInput" value="">
        <date-range-picker id="datePicker"></date-range-picker>
        <button id="analyzeButton">Analyze</button>
        <button id="last90DaysButton">Last 90 Days</button>
        <pre id="results"></pre>
        <button id="todayButton">Today</button>
        <div id="calendarContainer"></div>
    `;

    let fetchMock: Mock;

    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = FULL_DOM;
        // Default: fetch returns an error so runAnalysis() called on load doesn't throw.
        fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({ error: 'no timeline' }),
        });
        vi.stubGlobal('fetch', fetchMock);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function triggerFileChange(content: string) {
        const file = new File([content], 'Timeline.json', { type: 'application/json' });
        // jsdom doesn't implement Blob.prototype.text(); stub it directly.
        file.text = () => Promise.resolve(content);
        const input = document.getElementById('timelineFileInput')!;
        Object.defineProperty(input, 'files', { value: [file], configurable: true });
        input.dispatchEvent(new Event('change'));
    }

    it('shows segment count and green status on successful upload', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ ok: true, segments: 1234 }),
        });

        triggerFileChange(JSON.stringify({ semanticSegments: [] }));
        await new Promise(r => setTimeout(r, 0));

        const status = document.getElementById('uploadStatus')!;
        expect(status.textContent).toContain('1,234 segments loaded');
        expect(status.style.color).toBe('rgb(46, 125, 50)'); // #2e7d32
    });

    it('shows server error message and red status on validation failure', async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'File must contain a semanticSegments array' }),
        });

        triggerFileChange('{"notValid":true}');
        await new Promise(r => setTimeout(r, 0));

        const status = document.getElementById('uploadStatus')!;
        expect(status.textContent).toContain('File must contain a semanticSegments array');
        expect(status.style.color).toBe('rgb(198, 40, 40)'); // #c62828
    });
});

describe('CalendarRenderer interactions', () => {
    // January 2024: the 15th–19th are Mon–Fri. The 16th is visited in the timeline data.
    const ELIGIBLE = ['2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18', '2024-01-19'];
    let renderer: CalendarRenderer, refresh: Mock, logSpy: MockInstance;

    function setup() {
        refresh = vi.fn();
        renderer = new CalendarRenderer('cal', refresh);
        renderer.currentMonth = new Date(2024, 0, 1);
        renderer.setDates(['2024-01-16'], ELIGIBLE, '2024-01-15T00:00:00', '2024-01-19T23:59:59');
    }
    const day = (n: number) => document.querySelectorAll<HTMLElement>('#cal .calendar-day:not(.other-month)')[n - 1];
    const stored = (key: string) => JSON.parse(localStorage.getItem(key)!);
    const click = (el: HTMLElement) => { el.dispatchEvent(new MouseEvent('click')); vi.advanceTimersByTime(200); };
    // A real double-click fires click, click, dblclick.
    const dblclick = (el: HTMLElement) => {
        el.dispatchEvent(new MouseEvent('click'));
        el.dispatchEvent(new MouseEvent('click'));
        el.dispatchEvent(new MouseEvent('dblclick'));
        vi.advanceTimersByTime(200);
    };

    let fetchMock: Mock;

    beforeEach(() => {
        vi.useFakeTimers();
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        localStorage.clear();
        document.body.innerHTML = '<div id="cal"></div>';
        fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        logSpy.mockRestore();
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('writes toggled dates through to the server as well as localStorage', async () => {
        setup();
        click(day(15));
        expect(stored('excludedDates')).toEqual(['2024-01-15']);
        await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/state', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ excludedDates: '["2024-01-15"]' }),
            keepalive: true,
        })));
    });

    it('renders eligible, visited, weekend and bank holiday classes', () => {
        setup();
        expect(day(15).classList).toContain('eligible-working-day');
        expect(day(16).classList).toContain('visited-day');
        expect(day(16).querySelector('.day-indicator')!.textContent).toBe('Visited');
        expect(day(20).classList).toContain('weekend');
        expect(day(1).classList).toContain('bank-holiday');
    });

    it('loads excluded and manual visited dates from localStorage', () => {
        localStorage.setItem('excludedDates', JSON.stringify(['2024-01-17']));
        localStorage.setItem('manualVisitedDates', JSON.stringify(['2024-01-18']));
        setup();
        expect(day(17).classList).toContain('excluded-day');
        expect(day(17).classList).not.toContain('eligible-working-day');
        expect(day(18).classList).toContain('manual-visited-day');
    });

    it('single click excludes a day, saves it and triggers a refresh', () => {
        setup();
        click(day(15));
        expect(renderer.excludedDates.has('2024-01-15')).toBe(true);
        expect(stored('excludedDates')).toEqual(['2024-01-15']);
        expect(day(15).classList).toContain('excluded-day');
        expect(day(15).classList).not.toContain('eligible-working-day');
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('waits 200ms before applying a single click', () => {
        setup();
        day(15).dispatchEvent(new MouseEvent('click'));
        vi.advanceTimersByTime(199);
        expect(renderer.excludedDates.size).toBe(0);
        vi.advanceTimersByTime(1);
        expect(renderer.excludedDates.size).toBe(1);
    });

    it('a second single click re-includes the day', () => {
        setup();
        click(day(15));
        click(day(15));
        expect(stored('excludedDates')).toEqual([]);
        expect(day(15).classList).not.toContain('excluded-day');
        expect(day(15).classList).toContain('eligible-working-day');
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it('double click marks a day as manually visited without excluding it', () => {
        setup();
        dblclick(day(17));
        expect(stored('manualVisitedDates')).toEqual(['2024-01-17']);
        expect(localStorage.getItem('excludedDates')).toBeNull();
        expect(day(17).classList).toContain('manual-visited-day');
        expect(day(17).classList).toContain('visited-day');
        expect(day(17).querySelector('.day-indicator')!.textContent).toBe('Visited');
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('a second double click unmarks the manual visit', () => {
        setup();
        dblclick(day(17));
        dblclick(day(17));
        expect(stored('manualVisitedDates')).toEqual([]);
        expect(day(17).classList).not.toContain('visited-day');
        expect(day(17).querySelector('.day-indicator')).toBeNull();
    });

    it('double click does nothing on a day already visited in the timeline', () => {
        setup();
        dblclick(day(16));
        expect(renderer.manualVisitedDates.size).toBe(0);
        expect(localStorage.getItem('manualVisitedDates')).toBeNull();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('double click on an excluded day un-excludes it and marks it visited', () => {
        setup();
        click(day(17));
        dblclick(day(17));
        expect(stored('excludedDates')).toEqual([]);
        expect(stored('manualVisitedDates')).toEqual(['2024-01-17']);
        expect(day(17).classList).not.toContain('excluded-day');
        expect(day(17).classList).toContain('eligible-working-day');
    });

    it('single click on a manually visited day removes the visit and excludes it', () => {
        setup();
        dblclick(day(17));
        click(day(17));
        expect(stored('manualVisitedDates')).toEqual([]);
        expect(stored('excludedDates')).toEqual(['2024-01-17']);
        expect(day(17).classList).not.toContain('visited-day');
        expect(day(17).classList).toContain('excluded-day');
    });

    it('on render, drops a date from excludedDates when it is also manually visited', () => {
        localStorage.setItem('excludedDates', JSON.stringify(['2024-01-17']));
        localStorage.setItem('manualVisitedDates', JSON.stringify(['2024-01-17']));
        setup();
        expect(stored('excludedDates')).toEqual([]);
        expect(day(17).classList).not.toContain('excluded-day');
    });

    it('navigates months with the prev/next buttons, keeping state', () => {
        setup();
        click(day(15));
        document.querySelector<HTMLElement>('#nextMonth')!.click();
        expect(document.querySelector('#cal h3')!.textContent).toMatch(/February/);
        document.querySelector<HTMLElement>('#prevMonth')!.click();
        expect(document.querySelector('#cal h3')!.textContent).toMatch(/January/);
        expect(day(15).classList).toContain('excluded-day');
    });
});

describe('CalendarRenderer.changeMonth', () => {
    const shown = (r: CalendarRenderer) => r.currentMonth.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

    beforeEach(() => {
        vi.useFakeTimers();
        document.body.innerHTML = '<div id="cal"></div>';
    });
    afterEach(() => vi.useRealTimers());

    it('never skips a short month stepping back from the 31st', () => {
        vi.setSystemTime(new Date(2026, 9, 31)); // 31 Oct 2026
        const r = new CalendarRenderer('cal', null);
        const seen: string[] = [];
        for (let i = 0; i < 3; i++) { r.changeMonth(-1); seen.push(shown(r)); }
        expect(seen).toEqual(['September 2026', 'August 2026', 'July 2026']);
        for (let i = 0; i < 3; i++) { r.changeMonth(1); seen.push(shown(r)); }
        expect(seen.slice(3)).toEqual(['August 2026', 'September 2026', 'October 2026']);
    });

    it('lands on February, not March, from the 29th', () => {
        vi.setSystemTime(new Date(2026, 9, 29)); // 29 Oct 2026
        const r = new CalendarRenderer('cal', null);
        const seen: string[] = [];
        for (let i = 0; i < 8; i++) { r.changeMonth(-1); seen.push(shown(r)); }
        expect(seen[7]).toBe('February 2026');
        r.changeMonth(1);
        expect(shown(r)).toBe('March 2026');
    });
});

describe('server-saved state on page load', () => {
    const DOM = `
        <input type="text" id="placeIdInput" value="">
        <date-range-picker id="datePicker"></date-range-picker>
        <button id="analyzeButton">Analyze</button>
        <button id="last90DaysButton">Last 90 Days</button>
        <pre id="results"></pre>
        <button id="todayButton">Today</button>
        <div id="calendarContainer"></div>
    `;
    let fetchMock: Mock, warnSpy: MockInstance;

    // GET /state answers with `state` (or rejects if null). PATCH answers with `patched`,
    // or echoes its body (as the server would when it was empty). /analyze fails harmlessly.
    function server(state: Record<string, string> | null, patched?: Record<string, string>) {
        fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
            if (url === '/state' && !opts) {
                if (!state) throw new TypeError('Failed to fetch');
                return { ok: true, json: async () => state };
            }
            if (url.startsWith('/state')) return { ok: true, json: async () => patched ?? JSON.parse(opts!.body as string) };
            return { ok: false, json: async () => ({ error: 'no timeline' }) };
        });
        vi.stubGlobal('fetch', fetchMock);
    }
    const patches = () => fetchMock.mock.calls
        .filter(([url, opts]) => url.startsWith('/state') && opts?.method === 'PATCH')
        .map(([url, opts]) => ({ url, body: JSON.parse(opts.body) }));
    const tick = () => new Promise(r => setTimeout(r, 0));
    async function load() {
        document.body.innerHTML = DOM;
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await tick();
    }
    const change = async (input: HTMLInputElement, value: string) => {
        input.value = value;
        input.dispatchEvent(new Event('change'));
        await tick();
    };
    const picker = () => document.getElementById('datePicker') as DateRangePicker;
    const placeId = () => (document.getElementById('placeIdInput') as HTMLInputElement).value;

    beforeEach(() => {
        localStorage.clear();
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => {
        warnSpy.mockRestore();
        vi.unstubAllGlobals();
    });

    it('adopts the server state over this browser\'s localStorage without writing back', async () => {
        localStorage.setItem('placeId', 'local-place');
        localStorage.setItem('excludedDates', '["2024-01-01"]');
        server({
            placeId: 'server-place', excludedDates: '["2024-01-17"]',
            startDate: '2024-02-01', startTime: '08:00', endDate: '2024-02-28', endTime: '18:00',
        });
        await load();
        expect(placeId()).toBe('server-place');
        expect(localStorage.getItem('excludedDates')).toBe('["2024-01-17"]');
        expect(picker().startDateInput.value).toBe('2024-02-01');
        expect(picker().endTimeInput.value).toBe('18:00');
        expect(patches()).toEqual([]);
    });

    it('resets both times to the defaults when the server has no date range', async () => {
        for (const [k, v] of Object.entries({ startDate: '2024-02-01', startTime: '08:00', endDate: '2024-02-28', endTime: '18:00' })) {
            localStorage.setItem(k, v);
        }
        server({ placeId: 'server-place' });
        await load();
        expect(picker().startTimeInput.value).toBe('00:00');
        expect(picker().endTimeInput.value).toBe('23:59');
    });

    it('uploads this browser\'s localStorage when the server has no state yet', async () => {
        localStorage.setItem('placeId', 'local-place');
        localStorage.setItem('manualVisitedDates', '["2024-01-18"]');
        server({});
        await load();
        expect(patches()).toEqual([{ url: '/state?ifEmpty=1', body: { placeId: 'local-place', manualVisitedDates: '["2024-01-18"]' } }]);
        expect(placeId()).toBe('local-place');
    });

    it('adopts the other browser\'s state if it migrated first', async () => {
        localStorage.setItem('placeId', 'local-place');
        localStorage.setItem('manualVisitedDates', '["2024-01-18"]');
        server({}, { placeId: 'first-browser' });
        await load();
        expect(placeId()).toBe('first-browser');
        expect(localStorage.getItem('manualVisitedDates')).toBeNull();
    });

    it('drops shared keys the server does not have, so every browser shows the same state', async () => {
        localStorage.setItem('excludedDates', '["2024-01-01"]');
        localStorage.setItem('manualVisitedDates', '["2024-01-02"]');
        server({ placeId: 'server-place' });
        await load();
        expect(localStorage.getItem('excludedDates')).toBeNull();
        expect(localStorage.getItem('manualVisitedDates')).toBeNull();
        expect(placeId()).toBe('server-place');
    });

    it('saves only the changed date input once the range is saved', async () => {
        server({ startDate: '2024-02-01', startTime: '08:00', endDate: '2024-02-28', endTime: '18:00' });
        await load();
        await change(picker().startTimeInput, '09:00');
        expect(patches().map(p => p.body)).toEqual([{ startTime: '09:00' }]);
    });

    it('saves the whole date range on the first change if it was never saved', async () => {
        server({ placeId: 'server-place' });
        await load();
        await change(picker().startTimeInput, '09:00');
        expect(patches().map(p => p.body)).toEqual([{
            startDate: picker().startDateInput.value, startTime: '09:00',
            endDate: picker().endDateInput.value, endTime: picker().endTimeInput.value,
        }]);
    });

    it('treats an empty saved date field as unsaved and saves the whole range', async () => {
        server({ startDate: '', startTime: '08:00', endDate: '2024-02-28', endTime: '18:00' });
        await load();
        await change(picker().endTimeInput, '17:00');
        expect(patches().map(p => p.body)).toEqual([{
            startDate: picker().startDateInput.value, startTime: '00:00', endDate: picker().endDateInput.value, endTime: '17:00',
        }]);
        expect(picker().startDateInput.value).not.toBe('');
    });

    it('sends one PATCH at a time, in the order the edits were made', async () => {
        server({ placeId: 'server-place' });
        await load();
        let release!: () => void;
        fetchMock.mockImplementationOnce(() => new Promise(r => { release = () => r({ ok: true, json: async () => ({}) }); }));
        const input = document.getElementById('placeIdInput') as HTMLInputElement;
        await change(input, 'first');
        await change(input, 'second');
        expect(patches().map(p => p.body)).toEqual([{ placeId: 'first' }]);
        release();
        await tick();
        expect(patches().map(p => p.body)).toEqual([{ placeId: 'first' }, { placeId: 'second' }]);
    });

    it('keeps a date edited while the initial load is in flight', async () => {
        for (const [k, v] of Object.entries({ startDate: '2024-02-01', startTime: '08:00', endDate: '2024-02-28', endTime: '18:00' })) {
            localStorage.setItem(k, v);
        }
        let release!: () => void;
        fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
            if (url === '/state' && !opts) {
                await new Promise<void>(r => { release = r; });
                return { ok: true, json: async () => ({ startDate: '2024-02-01', startTime: '08:00', endDate: '2024-02-28', endTime: '18:00' }) };
            }
            return { ok: url.startsWith('/state'), json: async () => ({}) };
        });
        vi.stubGlobal('fetch', fetchMock);
        document.body.innerHTML = DOM;
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await change(picker().startTimeInput, '09:00');
        release();
        await tick();
        expect(picker().startTimeInput.value).toBe('09:00');
        expect(localStorage.getItem('startTime')).toBe('09:00');
    });

    it('holds edits made during load until the first-browser upload is done', async () => {
        for (const [k, v] of Object.entries({
            startDate: '2024-02-01', startTime: '08:00', endDate: '2024-02-28', endTime: '18:00', excludedDates: '["2024-02-05"]',
        })) localStorage.setItem(k, v);
        let release!: () => void;
        server({});
        const echo = fetchMock.getMockImplementation()!;
        fetchMock.mockImplementationOnce(async (url: string) => {
            await new Promise<void>(r => { release = r; });
            return echo(url);
        });
        document.body.innerHTML = DOM;
        document.dispatchEvent(new Event('DOMContentLoaded'));
        await change(picker().startTimeInput, '09:00');
        expect(patches()).toEqual([]);
        release();
        await tick();
        expect(patches().map(p => p.url)).toEqual(['/state?ifEmpty=1', '/state']);
        expect(patches()[0].body).toMatchObject({ startTime: '09:00', excludedDates: '["2024-02-05"]' });
        expect(localStorage.getItem('excludedDates')).toBe('["2024-02-05"]');
    });

    it('falls back to localStorage when the server is unreachable', async () => {
        localStorage.setItem('placeId', 'local-place');
        server(null);
        await load();
        expect(placeId()).toBe('local-place');
    });

    it('writes a changed Place ID through to the server', async () => {
        server({ placeId: 'server-place' });
        await load();
        await change(document.getElementById('placeIdInput') as HTMLInputElement, ' new-place ');
        expect(localStorage.getItem('placeId')).toBe('new-place');
        expect(patches().map(p => p.body)).toEqual([{ placeId: 'new-place' }]);
    });
});
