const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');

const hostname = '127.0.0.1';
const port = 3000;
const DATA_FILE = 'timeline.json'; // Assuming timeline.json is in the same directory

// Hardcoded list of UK Bank Holidays (England and Wales)
// Source: https://www.gov.uk/bank-holidays
// Note: This list should be updated periodically for future years.
const UK_BANK_HOLIDAYS = new Set([
    // 2012
    '2012-01-02', '2012-04-06', '2012-04-09', '2012-05-07', '2012-06-04', '2012-06-05', '2012-08-27', '2012-12-25', '2012-12-26',
    // 2013
    '2013-01-01', '2013-03-29', '2013-04-01', '2013-05-06', '2013-05-27', '2013-08-26', '2013-12-25', '2013-12-26',
    // 2014
    '2014-01-01', '2014-04-18', '2014-04-21', '2014-05-05', '2014-05-26', '2014-08-25', '2014-12-25', '2014-12-26',
    // 2015
    '2015-01-01', '2015-04-03', '2015-04-06', '2015-05-04', '2015-05-25', '2015-08-31', '2015-12-25', '2015-12-28',
    // 2016
    '2016-01-01', '2016-03-25', '2016-03-28', '2016-05-02', '2016-05-30', '2016-08-29', '2016-12-26', '2016-12-27',
    // 2017
    '2017-01-02', '2017-04-14', '2017-04-17', '2017-05-01', '2017-05-29', '2017-08-28', '2017-12-25', '2017-12-26',
    // 2018
    '2018-01-01', '2018-03-30', '2018-04-02', '2018-05-07', '2018-05-28', '2018-08-27', '2018-12-25', '2018-12-26',
    // 2019
    '2019-01-01', '2019-04-19', '2019-04-22', '2019-05-06', '2019-05-27', '2019-08-26', '2019-12-25', '2019-12-26',
    // 2020
    '2020-01-01', '2020-04-10', '2020-04-13', '2020-05-08', '2020-05-25', '2020-08-31', '2020-12-25', '2020-12-28',
    // 2021
    '2021-01-01', '2021-04-02', '2021-04-05', '2021-05-03', '2021-05-31', '2021-08-30', '2021-12-27', '2021-12-28',
    // 2022
    '2022-01-03', '2022-04-15', '2022-04-18', '2022-05-02', '2022-06-02', '2022-06-03', '2022-08-29', '2022-09-19', '2022-12-26', '2022-12-27',
    // 2023
    '2023-01-02', '2023-04-07', '2023-04-10', '2023-05-01', '2023-05-08', '2023-05-29', '2023-08-28', '2023-12-25', '2023-12-26',
    // 2024
    '2024-01-01', '2024-03-29', '2024-04-01', '2024-05-06', '2024-05-27', '2024-08-26', '2024-12-25', '2024-12-26',
    // 2025 (as per current request)
    '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
    // 2026
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
    // 2027
    '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28'
]);

// Helper function to format a Date object as 'YYYY-MM-DD' string for bank holiday check
function formatDateToYYYYMMDD(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Function to parse and analyze the timeline data
async function analyzeTimelineData(placeId, startDate, endDate, excludedDates, manualVisitedDates) {
    let rawData;
    try {
        rawData = await fs.promises.readFile(path.join(__dirname, DATA_FILE), 'utf8');
    } catch (error) {
        console.error("Error reading data file:", error);
        throw new Error("Failed to read timeline data. Make sure 'timeline.json' is in the same directory.");
    }

    const data = JSON.parse(rawData);
    const visits = [];

    if (data.semanticSegments && Array.isArray(data.semanticSegments)) {
        for (const segment of data.semanticSegments) {
            // Extract startTime and endTime from the semanticSegment level
            const segmentStartTimeStr = segment.startTime;
            const segmentEndTimeStr = segment.endTime;

            if (segment.visit) {
                const topCandidate = segment.visit.topCandidate || {};
                const currentPlaceId = topCandidate.placeId;

                visits.push({
                    placeId: currentPlaceId,
                    // Use segment-level timestamps, ensuring they are correctly parsed by Date constructor
                    startTimestamp: segmentStartTimeStr,
                    endTimestamp: segmentEndTimeStr
                });
            }
        }
    }

    // Convert string dates to Date objects for comparison.
    const startDatetime = new Date(startDate);
    const endDatetime = new Date(endDate);

    if (isNaN(startDatetime.getTime()) || isNaN(endDatetime.getTime())) {
        throw new Error("Invalid start or end date format provided from frontend. Please use ISO 8601 format (e.g., 'YYYY-MM-DDTHH:mm:ss.sssZ').");
    }

    // Filter visits by placeId and date range from timeline.json
    const uniqueVisitDaysFromTimeline = new Set();
    visits.filter(visit => {
        if (!visit.placeId || visit.placeId !== placeId) {
            return false;
        }
        const visitStartTimestamp = new Date(visit.startTimestamp);
        if (isNaN(visitStartTimestamp.getTime())) {
            console.warn(`Skipping visit due to invalid start timestamp: ${visit.startTimestamp}`);
            return false;
        }
        return visitStartTimestamp.getTime() >= startDatetime.getTime() &&
               visitStartTimestamp.getTime() <= endDatetime.getTime();
    }).forEach(visit => {
        uniqueVisitDaysFromTimeline.add(formatDateToYYYYMMDD(new Date(visit.startTimestamp)));
    });

    // Parse manually excluded dates from frontend
    const frontendExcludedDates = excludedDates ? new Set(JSON.parse(excludedDates)) : new Set();
    // Parse manually visited dates from frontend
    const frontendManualVisitedDates = manualVisitedDates ? new Set(JSON.parse(manualVisitedDates)) : new Set();

    // Combine unique visits from timeline.json and manually added visits
    const combinedVisitedDays = new Set([...uniqueVisitDaysFromTimeline, ...frontendManualVisitedDates]);
    const countVisitsInRange = combinedVisitedDays.size; // This is now the count of unique days visited

    // --- Collect eligible working days, excluding bank holidays and manually excluded dates ---
    const eligibleWorkingDates = []; // Array to store eligible working days (YYYY-MM-DD)
    let totalEligibleWorkingDays = 0;
    let currentDate = new Date(startDatetime); // Start from the beginning of the period
    currentDate.setUTCHours(0, 0, 0, 0); // Normalize to start of day for consistent comparison

    while (currentDate <= endDatetime) {
        const dayOfWeek = currentDate.getUTCDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
        const dateYYYYMMDD = formatDateToYYYYMMDD(currentDate);

        // Check if it's a weekday (Monday to Friday) AND not a bank holiday AND not manually excluded
        if (dayOfWeek >= 1 && dayOfWeek <= 5 && !UK_BANK_HOLIDAYS.has(dateYYYYMMDD) && !frontendExcludedDates.has(dateYYYYMMDD)) {
            totalEligibleWorkingDays++;
            eligibleWorkingDates.push(dateYYYYMMDD); // Add to the list
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1); // Move to the next day
    }

    // Calculate total working weeks based on eligible working days
    let averageVisitsPerWorkingWeek = 0;
    if (totalEligibleWorkingDays > 0) {
        const totalWorkingWeeks = totalEligibleWorkingDays / 5; // 5 working days per week
        averageVisitsPerWorkingWeek = countVisitsInRange / totalWorkingWeeks;
    }

    return {
        placeId: placeId,
        startDate: startDate,
        endDate: endDate,
        totalUniqueVisitDays: countVisitsInRange, // Renamed for clarity
        totalEligibleWorkingDays: totalEligibleWorkingDays, // Updated to reflect bank holiday exclusion
        averageVisitsPerWorkingWeek: parseFloat(averageVisitsPerWorkingWeek.toFixed(2)),
        visitedDates: Array.from(combinedVisitedDays).sort(), // Return sorted array of visited dates (combined)
        eligibleWorkingDates: eligibleWorkingDates.sort() // Return sorted array of eligible working dates
    };
}

// Create the HTTP server
const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    const filePath = path.join(__dirname, reqUrl.pathname);

    // Set CORS headers for all responses to allow frontend to fetch from backend API
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // API endpoint for analysis
    if (reqUrl.pathname === '/analyze' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        const { placeId, startDate, endDate, excludedDates, manualVisitedDates } = reqUrl.query; // Get excluded and manual visited dates

        if (!placeId || !startDate || !endDate) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing parameters: placeId, startDate, and endDate are required.' }));
            return;
        }

        try {
            const results = await analyzeTimelineData(placeId, startDate, endDate, excludedDates, manualVisitedDates); // Pass both
            res.statusCode = 200;
            res.end(JSON.stringify(results));
        } catch (error) {
            console.error("Analysis error:", error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message || 'An error occurred during analysis.' }));
        }
    } 
    // Serve static files (index.html, frontend.js)
    else {
        let contentType = 'text/html';
        if (reqUrl.pathname.endsWith('.js')) {
            contentType = 'application/javascript';
        } else if (reqUrl.pathname.endsWith('.css')) {
            contentType = 'text/css';
        }

        fs.readFile(filePath === path.join(__dirname, '/') ? path.join(__dirname, 'index.html') : filePath, (err, data) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end(`Server Error: ${err.code}`);
                }
            } else {
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(data);
            }
        });
    }
});

// Start the server
server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
    console.log(`Open your browser to: http://${hostname}:${port}/`);
    console.log(`Make sure your '${DATA_FILE}' and 'frontend.js' are in the same directory as this script.`);
});
