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

    beforeEach(() => {
        vi.useFakeTimers();
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        localStorage.clear();
        document.body.innerHTML = '<div id="cal"></div>';
    });

    afterEach(() => {
        logSpy.mockRestore();
        vi.useRealTimers();
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
