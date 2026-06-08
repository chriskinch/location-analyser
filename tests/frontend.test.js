// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the utilities exported by frontend.js
// The module.exports guard in frontend.js makes these available in Node/Vitest.
// The DOMContentLoaded callback at the bottom of frontend.js will not fire
// automatically during import since jsdom's document is already parsed.
import { debounce, CalendarRenderer, DateRangePicker, initAuthBar } from '../frontend.js';

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
    let renderer;

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

describe('initAuthBar', () => {
    let reloadMock;

    beforeEach(() => {
        document.body.innerHTML = `
            <span id="authLoggedOut">Sign in</span>
            <span id="authLoggedIn" style="display:none">
                Signed in as <strong id="authUserName"></strong>
                <button id="signOutBtn">Sign out</button>
            </span>
        `;
        reloadMock = vi.fn();
        vi.stubGlobal('location', { reload: reloadMock });
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('shows logged-in state and user name when authenticated', async () => {
        global.fetch.mockResolvedValue({
            json: () => Promise.resolve({ authenticated: true, user: { name: 'Alice', email: 'alice@example.com' } }),
        });
        await initAuthBar();
        expect(document.getElementById('authLoggedOut').style.display).toBe('none');
        expect(document.getElementById('authLoggedIn').style.display).toBe('inline');
        expect(document.getElementById('authUserName').textContent).toBe('Alice');
    });

    it('falls back to email when name is absent', async () => {
        global.fetch.mockResolvedValue({
            json: () => Promise.resolve({ authenticated: true, user: { name: '', email: 'bob@example.com' } }),
        });
        await initAuthBar();
        expect(document.getElementById('authUserName').textContent).toBe('bob@example.com');
    });

    it('leaves UI unchanged when not authenticated', async () => {
        global.fetch.mockResolvedValue({
            json: () => Promise.resolve({ authenticated: false }),
        });
        await initAuthBar();
        expect(document.getElementById('authLoggedIn').style.display).toBe('none');
    });

    it('leaves UI unchanged when fetch throws', async () => {
        global.fetch.mockRejectedValue(new Error('Network error'));
        await initAuthBar();
        expect(document.getElementById('authLoggedIn').style.display).toBe('none');
    });

    it('sign-out button POSTs to /auth/logout and reloads', async () => {
        global.fetch.mockResolvedValue({ json: () => Promise.resolve({ authenticated: false }) });
        await initAuthBar();

        global.fetch.mockResolvedValue({});
        document.getElementById('signOutBtn').click();
        await new Promise(r => setTimeout(r, 0));

        expect(global.fetch).toHaveBeenLastCalledWith('/auth/logout', { method: 'POST' });
        expect(reloadMock).toHaveBeenCalled();
    });

    it('still reloads if sign-out fetch fails', async () => {
        global.fetch.mockResolvedValue({ json: () => Promise.resolve({ authenticated: false }) });
        await initAuthBar();

        global.fetch.mockRejectedValue(new Error('Server down'));
        document.getElementById('signOutBtn').click();
        await new Promise(r => setTimeout(r, 0));

        expect(reloadMock).toHaveBeenCalled();
    });
});

describe('DateRangePicker.formatDateForInput', () => {
    let picker;

    beforeEach(() => {
        // DateRangePicker constructor creates shadow DOM with input elements
        document.body.innerHTML = '<date-range-picker id="picker"></date-range-picker>';
        picker = document.getElementById('picker');
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
