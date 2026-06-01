const fs = require('fs');
const path = require('path');

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
    // 2025
    '2025-01-01', '2025-04-18', '2025-04-21', '2025-05-05', '2025-05-26', '2025-08-25', '2025-12-25', '2025-12-26',
    // 2026
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
    // 2027
    '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28'
]);

function formatDateToYYYYMMDD(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const day = date.getUTCDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function analyzeTimelineData(placeId, startDate, endDate, excludedDates, manualVisitedDates, dataFilePath) {
    const filePath = dataFilePath || path.join(__dirname, 'timeline.json');
    let rawData;
    try {
        rawData = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
        console.error("Error reading data file:", error);
        throw new Error("Failed to read timeline data. Make sure 'timeline.json' is in the same directory.");
    }

    const data = JSON.parse(rawData);
    const visits = [];

    if (data.semanticSegments && Array.isArray(data.semanticSegments)) {
        for (const segment of data.semanticSegments) {
            const segmentStartTimeStr = segment.startTime;
            const segmentEndTimeStr = segment.endTime;

            if (segment.visit) {
                const topCandidate = segment.visit.topCandidate || {};
                const currentPlaceId = topCandidate.placeId;

                visits.push({
                    placeId: currentPlaceId,
                    startTimestamp: segmentStartTimeStr,
                    endTimestamp: segmentEndTimeStr
                });
            }
        }
    }

    const startDatetime = new Date(startDate);
    const endDatetime = new Date(endDate);

    if (isNaN(startDatetime.getTime()) || isNaN(endDatetime.getTime())) {
        throw new Error("Invalid start or end date format provided from frontend. Please use ISO 8601 format (e.g., 'YYYY-MM-DDTHH:mm:ss.sssZ').");
    }

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

    const frontendExcludedDates = excludedDates ? new Set(JSON.parse(excludedDates)) : new Set();
    const frontendManualVisitedDates = manualVisitedDates ? new Set(JSON.parse(manualVisitedDates)) : new Set();

    const combinedVisitedDays = new Set([...uniqueVisitDaysFromTimeline, ...frontendManualVisitedDates]);
    const countVisitsInRange = combinedVisitedDays.size;

    const eligibleWorkingDates = [];
    let totalEligibleWorkingDays = 0;
    let currentDate = new Date(startDatetime);
    currentDate.setUTCHours(0, 0, 0, 0);

    while (currentDate <= endDatetime) {
        const dayOfWeek = currentDate.getUTCDay();
        const dateYYYYMMDD = formatDateToYYYYMMDD(currentDate);

        if (dayOfWeek >= 1 && dayOfWeek <= 5 && !UK_BANK_HOLIDAYS.has(dateYYYYMMDD) && !frontendExcludedDates.has(dateYYYYMMDD)) {
            totalEligibleWorkingDays++;
            eligibleWorkingDates.push(dateYYYYMMDD);
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    let averageVisitsPerWorkingWeek = 0;
    if (totalEligibleWorkingDays > 0) {
        const totalWorkingWeeks = totalEligibleWorkingDays / 5;
        averageVisitsPerWorkingWeek = countVisitsInRange / totalWorkingWeeks;
    }

    return {
        placeId: placeId,
        startDate: startDate,
        endDate: endDate,
        totalUniqueVisitDays: countVisitsInRange,
        totalEligibleWorkingDays: totalEligibleWorkingDays,
        averageVisitsPerWorkingWeek: parseFloat(averageVisitsPerWorkingWeek.toFixed(2)),
        visitedDates: Array.from(combinedVisitedDays).sort(),
        eligibleWorkingDates: eligibleWorkingDates.sort()
    };
}

module.exports = { UK_BANK_HOLIDAYS, formatDateToYYYYMMDD, analyzeTimelineData };
