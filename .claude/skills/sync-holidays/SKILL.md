---
name: sync-holidays
description: Fetch Chris's approved absences (annual leave, holiday buy, sickness, any type) for the past 90 days from Workday's "My Absence" page in the built-in browser and merge them into holidays.json at the repo root, which the location-analyser calendar auto-excludes from working days. Read-only in Workday. Never removes dates already in the file. Use when the user says "/sync-holidays", "sync my holidays", "update holidays.json", "pull my leave from Workday", "exclude my annual leave", or asks to refresh the auto-excluded days.
---

# sync-holidays

Fills `holidays.json` (repo root, git-ignored) from Workday. The app reads that file and treats every date in it as excluded, exactly like clicking the day in the calendar. File format: README → "Cached holidays".

## Rules
- **Read-only in Workday.** Never click Request, Submit, OK, Cancel, Approve or Review; never open the team's absence requests in To Do. Only navigate and read.
- **Never enter credentials.** If the browser lands on `login.microsoftonline.com`, stop and ask Chris to sign in in the Browser pane, then wait.
- Absence data is personal. Keep it local: rows go to the scratchpad, dates go to `holidays.json`. Don't read the Comment column or quote it anywhere.
- Default window is the **past 90 days** (London time, ending today). Use another number only if Chris asks ("past 6 months" → 183).

## Steps
1. **Open My Absence.** Navigate the built-in browser to `https://wd103.myworkday.com/lego/d/task/2997$276.htmld`. If that URL stops working, open `https://workday.thelegogroup.com/`, search for `My Absence`, and pick the **My Time Off** report (it opens the "My Absence" page). Wait until the page text shows `Absence Requests`.
2. **Extract rows** with `javascript_tool`. Rows are newest first; the first ~50 loaded rows go back well over 90 days. Dates are DD/MM/YYYY and sit in the row's header cell.
   ```js
   const t = [...document.querySelectorAll('table')].find(t => t.innerText.includes('Day of the Week'));
   const rows = [...t.querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => c.innerText.trim()))
     .filter(c => /^\d{2}\/\d{2}\/\d{4}$/.test(c[0]))
     .map(([date, , type, requested, unit, , status]) => ({ date, type, requested: Number(requested), unit, status }));
   JSON.stringify(rows);
   ```
   If the table is missing or `rows` is empty, take a screenshot and tell Chris rather than guessing. If the oldest row is still inside the window, scroll the table to load more and re-run.
3. **Save the rows** to `<scratchpad>/workday-absence.json` with Write.
4. **Merge** from the repo root:
   ```bash
   npm run build && node dist/holidays.js workday "<scratchpad>/workday-absence.json" 90
   ```
   It keeps only `Approved` rows, nets corrections per date (Workday books a half day back as a negative row), counts any absence type, converts hours at 7.5 h per day, and adds each date with time off left as `{ "date": "YYYY-MM-DD", "note": "Workday: <types>[ (0.5 day)]" }`. Dates already in the file, hand-added or not, are kept unchanged; nothing is ever removed. A malformed `holidays.json` makes it fail without writing: report the error and let Chris fix the file.
5. **Report** the CLI's one-line summary and the dates added. Cancelled leave is not removed automatically: if a date in the file has no time off left in Workday, list it and ask Chris whether to delete it by hand.
6. Delete the scratchpad rows file. If the app is running, reloading the page picks up the new dates.
