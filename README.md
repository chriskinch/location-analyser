# Location Analyser (LVA)

A web application for analyzing workplace visits from Google Timeline/Takeout data against UK working days. Calculate visit statistics, exclude bank holidays, and interactively manage dates with a visual calendar interface.

## Features

- **Timeline Data Analysis**: Process Google Timeline/Takeout JSON data to identify location visits
- **UK Working Days**: Automatically exclude weekends and UK bank holidays (2012-2027)
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

4. Start the server:
```bash
node app.js
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

## Architecture

- **Backend**: Node.js HTTP server with timeline data processing
- **Frontend**: Vanilla JavaScript with custom web components
- **Data Storage**: Browser localStorage for preferences and manual date adjustments
- **Calendar**: Custom interactive calendar renderer with click/double-click functionality

## Privacy

- Timeline data files (`timeline*.json`) are automatically excluded from git
- No data is sent to external servers - all processing happens locally
- Manual date adjustments are stored only in your browser's localStorage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source. Please ensure you comply with Google's terms of service when using Timeline/Takeout data.