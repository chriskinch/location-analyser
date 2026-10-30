# Location Analyser (LVA)

A web application for analyzing workplace visits from Google Timeline/Takeout data against UK working days. Calculate visit statistics, exclude bank holidays, and interactively manage dates with a visual calendar interface.

## Features

- **Timeline Data Analysis**: Process Google Timeline/Takeout JSON data to identify location visits
- **UK Working Days**: Automatically exclude weekends and UK bank holidays (2012-2028)
- **Interactive Calendar**: 
  - Click to exclude/include working days
  - Double-click to manually mark days as visited
  - Navigate through months while maintaining current month focus
- **Date Range Selection**: Custom date picker with localStorage persistence
- **Quick Actions**: "Last 90 Days" button for instant date range setup
- **Real-time Updates**: Debounced analysis with automatic recalculation on calendar interactions

## Getting Started

### Prerequisites

- Node.js 18 or later
- Google Maps Timeline export (`Timeline.json` from your Android device)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/chriskinch/location-analyser.git
cd location-analyser
```

2. Install dependencies:
```bash
npm install
```

3. Export your timeline data from your Android device:
   - Open **Google Maps** → your profile picture → **Settings** → **Location** → **Google Location History** → **Export**
   - This downloads a `Timeline.json` file to your device; transfer it to your computer

4. Build and start the server:
```bash
npm start
```

5. Open your browser to http://127.0.0.1:3000/ and upload your `Timeline.json` via the **Upload Timeline Data** section at the top of the page

## Usage

1. **Place ID**: Enter the Google Places ID for your workplace location
2. **Date Range**: Select start and end dates/times, or use "Last 90 Days" for quick setup
3. **Analysis**: Click "Analyze Visits" to process your data
4. **Calendar Interaction**: 
   - Single-click days to exclude them from working day calculations
   - Double-click days to manually mark them as visited
   - Navigate months using arrow buttons

## Data Structure

The application expects Google Timeline data in the semantic segments format:
```json
{
  "semanticSegments": [
    {
      "startTime": "2023-01-01T09:00:00.000Z",
      "endTime": "2023-01-01T17:00:00.000Z",
      "visit": {
        "topCandidate": {
          "placeId": "ChIJ...",
          "semanticType": "WORK"
        }
      }
    }
  ]
}
```

## API

### GET `/analyze`

Analyzes timeline data for a specific location and date range.

**Parameters:**
- `placeId` - Google Places ID
- `startDate` - ISO 8601 datetime string
- `endDate` - ISO 8601 datetime string  
- `excludedDates` - JSON array of manually excluded dates
- `manualVisitedDates` - JSON array of manually added visit dates

**Response:**
```json
{
  "totalUniqueVisitDays": 45,
  "totalEligibleWorkingDays": 65,
  "averageVisitsPerWorkingWeek": 3.46,
  "visitedDates": ["2023-01-03", "2023-01-04", ...],
  "eligibleWorkingDates": ["2023-01-02", "2023-01-03", ...]
}
```

### GET/PATCH `/state`

Your saved selections (date range, Place ID, excluded and manually visited days). `GET` returns them, or `{}` if nothing is saved yet. `PATCH` merges the keys you send, so the last write wins for each key. `PATCH /state?ifEmpty=1` writes only if nothing is saved yet; it's used for the first-browser upload, and returns whatever is saved. Only same-origin requests to `127.0.0.1`/`localhost` are accepted.

## Saved selections (`state.json`)

Selections are kept in the browser's localStorage, as before, and mirrored to `state.json` at the repo root, so every browser on this machine shows the same ones. On page load the server's copy replaces the browser's. When there is no `state.json` yet, the first browser to load uploads its localStorage. If the server isn't reachable, the page uses localStorage alone. `state.json` is git-ignored. Delete it to start over.

## Architecture

- **Backend**: Node.js HTTP server with timeline data processing
- **Frontend**: Vanilla TypeScript with custom web components, compiled to `dist/frontend.js`
- **Language**: TypeScript (strict); `npm run build` compiles to `dist/`, `npm test` type-checks and runs Vitest
- **Data Storage**: Browser localStorage for preferences and manual date adjustments, mirrored to a local `state.json`
- **Calendar**: Custom interactive calendar renderer with click/double-click functionality

## Privacy

- Timeline data files (`timeline*.json`) are automatically excluded from git
- No data is sent to external servers - all processing happens locally
- Manual date adjustments are stored in your browser's localStorage and in the git-ignored `state.json` on your machine

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Claude issue automation

[`.github/workflows/claude-issues.yml`](.github/workflows/claude-issues.yml) uses [Claude Code Action](https://github.com/anthropics/claude-code-action) to work on issues:

1. **Issue opened, or a new comment added:** Claude posts a requirements comment (acceptance criteria, scope, open questions) and updates that same comment as questions are answered in the thread.
2. **`ready` label added:** Claude implements the change on a `<type>/<issue>-<slug>` branch, runs `npm test`, opens a PR that closes the issue, and comments the PR link on the issue. The PR then goes through the normal checks.

Claude only acts on issues and comments from the repo owner and collaborators. Text from anyone else is never passed to it. Commits are authored as the repo owner, with `claude[bot]` as the committer.

### Setup

1. Install the [Claude GitHub App](https://github.com/apps/claude) on this repository. Implementation pushes and PRs use its token, so the PR triggers CI. PRs opened with `GITHUB_TOKEN` don't.
2. Add a repository secret named `ANTHROPIC_API_KEY` (**Settings → Secrets and variables → Actions**). To use a Claude subscription instead, run `claude setup-token`, save the token as `CLAUDE_CODE_OAUTH_TOKEN`, and switch both `anthropic_api_key:` lines in the workflow to `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}`.
3. Create the `ready` label if it doesn't exist yet: `gh label create ready`.
4. Recommended: enable the "Merge to main" ruleset, or protect `main`, so nothing can push to it directly.

## License

This project is open source. Please ensure you comply with Google's terms of service when using Timeline/Takeout data.