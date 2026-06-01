# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Start the development server:**
```bash
node app.js
```

**Use http-server for static serving (alternative):**
```bash
npx http-server
```

The application runs on `http://127.0.0.1:3000/` by default.

## Project Architecture

This is a location visit analysis application that processes Google Timeline/Takeout data to calculate workplace visit statistics against UK working days.

### Core Components

**Backend (app.js):**
- Node.js HTTP server with `/analyze` API endpoint
- Processes timeline data from `timeline.json` file
- Calculates visits vs eligible working days (excluding weekends and UK bank holidays)
- Handles manual date exclusions and additions from frontend

**Frontend (frontend.js + index.html):**
- Custom Web Component: `DateRangePicker` for date/time selection with localStorage persistence
- `CalendarRenderer` class for interactive calendar visualization
- Interactive calendar allows:
  - Single-click to exclude/include eligible working days
  - Double-click to manually mark days as visited
- Debounced analysis updates (300ms) for real-time feedback

**Data Structure:**
Timeline JSON contains `semanticSegments` array with:
- `startTime`/`endTime` timestamps
- `visit.topCandidate.placeId` for location matching
- Used to identify unique visit days within date ranges

### Key Features

1. **UK Bank Holiday Handling:** Hardcoded UK bank holidays (2012-2027) excluded from working day calculations
2. **Interactive Calendar:** Visual representation with click/double-click interactions for manual adjustments
3. **Local Storage Persistence:** User preferences saved (dates, placeId, exclusions, manual visits)
4. **Real-time Analysis:** Automatic recalculation when calendar interactions occur

### File Dependencies

- `timeline.json` - Main data source (Google Takeout timeline data)
- `timeline.may.json`, `timeline.sep.json` - Alternative/archive data files
- `archive_browser.html` - Separate archive browsing interface

### API Endpoint

`GET /analyze?placeId={id}&startDate={iso}&endDate={iso}&excludedDates={json}&manualVisitedDates={json}`

Returns:
```json
{
  "totalUniqueVisitDays": number,
  "totalEligibleWorkingDays": number,
  "averageVisitsPerWorkingWeek": number,
  "visitedDates": ["YYYY-MM-DD", ...],
  "eligibleWorkingDates": ["YYYY-MM-DD", ...]
}
```

### Development Notes

- Bank holiday lists need periodic updates for future years
- Timeline data format follows Google Takeout semantic segments structure
- Frontend uses ES6 modules and custom elements
- Calendar rendering optimized for month-by-month navigation
- Debouncing prevents excessive API calls during user interactions

## AI Safety Guidelines

These rules govern how Claude Code must behave in this repository. They are not suggestions — follow them unless the user explicitly overrides a specific rule for a specific task.

### Never Break the Running App

- Verify `node app.js` starts cleanly after any backend change
- Verify the `/analyze` endpoint responds correctly after any server-side change
- For frontend changes, test in a browser before declaring the task done
- If a change could break something and cannot be verified, say so explicitly — do not claim success

### Preserve API Contracts

- Do not change the `/analyze` endpoint's query parameters or response shape without explicit approval
- Do not rename or remove `localStorage` keys — this silently destroys saved user state
- Do not rename or remove public functions or classes in `frontend.js` without explicit approval

### Protect Data Files

- Never modify `timeline.json`, `timeline.may.json`, or `timeline.sep.json` — these are source data, not code
- Never delete any file without an explicit instruction to do so

### Scope Discipline

- Only change what was asked. No opportunistic refactoring, cleanup, or "while I'm in here" improvements
- One logical change per task — do not bundle unrelated fixes into a single commit
- Do not add new npm dependencies without approval

### Confirm Before Irreversible Actions

- Ask before any `git reset`, force push, file deletion, or other destructive git operation
- Commit current work before starting large or risky changes so there is always a rollback point

### Uphold These Guidelines

- If asked to do something that conflicts with these rules, flag the conflict clearly and ask for explicit confirmation before proceeding
- Do not silently skip a guideline — surface the tension and let the user decide