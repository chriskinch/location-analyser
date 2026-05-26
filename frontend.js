// --- Custom Web Component: DateRangePicker ---
// This component provides a reusable date and time input pair for start and end dates.
class DateRangePicker extends HTMLElement {
    constructor() {
        super();
        // Attach a Shadow DOM to encapsulate the component's internal structure and styles.
        const shadow = this.attachShadow({ mode: 'open' });

        // Define internal styles for the component's elements.
        const style = document.createElement('style');
        style.textContent = `
            div {
                margin-bottom: 15px;
                display: flex;
                align-items: center;
                flex-wrap: wrap; /* Allow wrapping on small screens */
            }
            label {
                display: inline-block;
                margin-right: 10px;
                width: 90px; /* Fixed width for labels for alignment */
                font-weight: 500;
                color: #444;
                flex-shrink: 0; /* Prevent label from shrinking */
            }
            input[type="date"],
            input[type="time"] {
                padding: 8px;
                border: 1px solid #ccc;
                border-radius: 5px;
                margin-right: 10px;
                flex-grow: 1; /* Allow inputs to grow */
                min-width: 120px; /* Minimum width for inputs */
                box-sizing: border-box;
            }
            /* Responsive adjustments for inputs within the component */
            @media (max-width: 480px) {
                label {
                    width: 100%; /* Label takes full width */
                    margin-bottom: 5px;
                }
                input[type="date"],
                input[type="time"] {
                    width: 100%; /* Inputs take full width */
                    margin-right: 0;
                    margin-bottom: 10px;
                }
            }
        `;
        shadow.appendChild(style);

        // Create elements for the start date and time inputs.
        const startDateDiv = document.createElement('div');
        startDateDiv.innerHTML = `
            <label for="startDate">Start Date:</label>
            <input type="date" id="startDate">
            <input type="time" id="startTime" value="00:00">
        `;
        shadow.appendChild(startDateDiv);

        // Create elements for the end date and time inputs.
        const endDateDiv = document.createElement('div');
        endDateDiv.innerHTML = `
            <label for="endDate">End Date:</label>
            <input type="date" id="endDate">
            <input type="time" id="endTime" value="23:59">
        `;
        shadow.appendChild(endDateDiv);

        // Store references to the input elements for easy access.
        this.startDateInput = shadow.getElementById('startDate');
        this.startTimeInput = shadow.getElementById('startTime');
        this.endDateInput = shadow.getElementById('endDate');
        this.endTimeInput = shadow.getElementById('endTime');
    }

    // Helper function to format a Date object into 'YYYY-MM-DD' string for input type="date".
    formatDateForInput(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Method to get the combined start datetime as an ISO string (UTC).
    // This format is suitable for passing to the Node.js backend.
    getStartDatetimeISO() {
        const datePart = this.startDateInput.value;
        const timePart = this.startTimeInput.value;
        if (!datePart || !timePart) return null;
        // Construct a Date object assuming the input is in local time, then convert to ISO UTC string.
        return new Date(`${datePart}T${timePart}:00`).toISOString();
    }

    // Method to get the combined end datetime as an ISO string (UTC).
    // This format is suitable for passing to the Node.js backend.
    getEndDatetimeISO() {
        const datePart = this.endDateInput.value;
        const timePart = this.endTimeInput.value;
        if (!datePart || !timePart) return null;
        // Construct a Date object assuming the input is in local time, then convert to ISO UTC string.
        return new Date(`${datePart}T${timePart}:00`).toISOString();
    }

    // Lifecycle callback: Called when the element is inserted into the DOM.
    connectedCallback() {
        // Try to load saved dates from local storage
        const savedStartDate = localStorage.getItem('startDate');
        const savedStartTime = localStorage.getItem('startTime');
        const savedEndDate = localStorage.getItem('endDate');
        const savedEndTime = localStorage.getItem('endTime');

        if (savedStartDate && savedStartTime && savedEndDate && savedEndTime) {
            this.startDateInput.value = savedStartDate;
            this.startTimeInput.value = savedStartTime;
            this.endDateInput.value = savedEndDate;
            this.endTimeInput.value = savedEndTime;
        } else {
            // Set default dates if nothing is saved in local storage
            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 30); // Default to 30 days ago for start date

            this.startDateInput.value = this.formatDateForInput(pastDate);
            this.endDateInput.value = this.formatDateForInput(today);
        }

        // Add event listeners to save changes to local storage
        this.startDateInput.addEventListener('change', () => this.saveDatesToLocalStorage());
        this.startTimeInput.addEventListener('change', () => this.saveDatesToLocalStorage());
        this.endDateInput.addEventListener('change', () => this.saveDatesToLocalStorage());
        this.endTimeInput.addEventListener('change', () => this.saveDatesToLocalStorage());
    }

    // Method to save the current date and time selections to local storage
    saveDatesToLocalStorage() {
        localStorage.setItem('startDate', this.startDateInput.value);
        localStorage.setItem('startTime', this.startTimeInput.value);
        localStorage.setItem('endDate', this.endDateInput.value);
        localStorage.setItem('endTime', this.endTimeInput.value);
    }

    // Method to set dates programmatically (e.g., for "Last 90 Days" button)
    setDateRange(startDate, endDate, startTime = '00:00', endTime = '23:59') {
        this.startDateInput.value = this.formatDateForInput(startDate);
        this.startTimeInput.value = startTime;
        this.endDateInput.value = this.formatDateForInput(endDate);
        this.endTimeInput.value = endTime;
        this.saveDatesToLocalStorage(); // Save to localStorage
    }
}

// Define the custom element. This registers the DateRangePicker class with the 'date-range-picker' tag.
customElements.define('date-range-picker', DateRangePicker);


// Hardcoded list of UK Bank Holidays (England and Wales) for frontend display
// This list should ideally be fetched from a reliable API or kept in sync with the backend.
const UK_BANK_HOLIDAYS_FRONTEND = new Set([
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


// --- Debounce Function ---
// This function returns a new function that, when called, will delay the execution
// of the original function until after a specified wait time has passed without
// any further invocations. Useful for preventing too many calls to an expensive function.
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}


// --- Calendar Renderer ---
// This class handles rendering a monthly paginated calendar and highlighting specific dates.
class CalendarRenderer {
    constructor(containerId, onAnalysisRefreshCallback) { // Renamed callback for clarity
        this.container = document.getElementById(containerId);
        this.onAnalysisRefreshCallback = onAnalysisRefreshCallback; // Store the callback
        this.currentMonth = new Date(); // Start with the current month for display
        this.visitedDates = new Set(); // Stores 'YYYY-MM-DD' strings of visited days (from backend)
        this.eligibleWorkingDates = new Set(); // Stores 'YYYY-MM-DD' strings of eligible working days (from backend)
        this.analysisStartDate = null; // To store the analysis period start date
        this.analysisEndDate = null; // To store the analysis period end date
        this.excludedDates = new Set(); // Store dates manually excluded by user (from eligible working days)
        this.manualVisitedDates = new Set(); // NEW: Store dates manually marked as visited by user

        // Load excluded and manual visited dates from local storage on initialization
        const savedExcludedDates = localStorage.getItem('excludedDates');
        if (savedExcludedDates) {
            this.excludedDates = new Set(JSON.parse(savedExcludedDates));
        }
        const savedManualVisitedDates = localStorage.getItem('manualVisitedDates'); // NEW
        if (savedManualVisitedDates) {
            this.manualVisitedDates = new Set(JSON.parse(savedManualVisitedDates)); // NEW
        }

        this.render(); // Initial render of an empty calendar
    }

    // Method to update the calendar with new data from the backend.
    setDates(visitedDatesArray, eligibleWorkingDatesArray, analysisStartDateISO, analysisEndDateISO) {
        this.visitedDates = new Set(visitedDatesArray);
        this.eligibleWorkingDates = new Set(eligibleWorkingDatesArray);
        this.analysisStartDate = new Date(analysisStartDateISO);
        this.analysisEndDate = new Date(analysisEndDateISO);

        // Always preserve the current month - don't change it based on analysis dates
        // The calendar should stay on the current month (today's month) regardless of data

        this.render(); // Re-render calendar with new data
    }

    // Helper to format a Date object to 'YYYY-MM-DD' string for set lookups.
    formatDateToYYYYMMDD(date) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Renders the calendar grid for the currentMonth.
    render() {
        this.container.innerHTML = ''; // Clear previous calendar content

        // Create calendar header with month/year and navigation buttons.
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.innerHTML = `
            <button id="prevMonth">&lt;</button>
            <h3>${this.currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h3>
            <button id="nextMonth">&gt;</button>
        `;
        this.container.appendChild(header);

        // Add event listeners for month navigation.
        header.querySelector('#prevMonth').addEventListener('click', () => this.changeMonth(-1));
        header.querySelector('#nextMonth').addEventListener('click', () => this.changeMonth(1));

        // Create the grid for days of the week and dates.
        const grid = document.createElement('div');
        grid.className = 'calendar-grid';
        this.container.appendChild(grid);

        // Add day of the week headers.
        const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        daysOfWeek.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'calendar-day-header';
            dayHeader.textContent = day;
            grid.appendChild(dayHeader);
        });

        // Determine the first and last day of the current month.
        const firstDayOfMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
        const lastDayOfMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0);

        // Calculate the day of the week for the first day of the month (0 = Sunday, 1 = Monday, etc.)
        const startDayIndex = firstDayOfMonth.getDay();

        // Fill leading empty days (from previous month) to align with the first day of the week.
        for (let i = 0; i < startDayIndex; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day other-month';
            grid.appendChild(emptyDay);
        }

        // Fill days of the current month.
        for (let day = 1; day <= lastDayOfMonth.getDate(); day++) {
            const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), day);
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';

            const dayNumber = document.createElement('div');
            dayNumber.className = 'day-number';
            dayNumber.textContent = day;
            dayElement.appendChild(dayNumber);

            const dateString = this.formatDateToYYYYMMDD(date);
            const isVisitedFromBackend = this.visitedDates.has(dateString); // Visited from timeline.json
            let isManualVisited = this.manualVisitedDates.has(dateString); // Manually marked visited
            let isExcluded = this.excludedDates.has(dateString); // Manually excluded from eligible working days

            const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Sunday or Saturday
            const isBankHoliday = UK_BANK_HOLIDAYS_FRONTEND.has(dateString); // Check against frontend bank holiday list

            // Ensure mutual exclusivity in rendering (frontend visual state)
            // If a day is manually visited, it cannot be excluded visually.
            if (isManualVisited) {
                isExcluded = false; // Prioritize manual visited style
                // Ensure it's removed from excludedDates if it somehow got there
                if (this.excludedDates.has(dateString)) {
                    this.excludedDates.delete(dateString);
                    localStorage.setItem('excludedDates', JSON.stringify(Array.from(this.excludedDates)));
                }
            } else if (isExcluded && isVisitedFromBackend) {
                // If a day is excluded but also visited from backend, prioritize visited visually
                isExcluded = false;
            }


            // Add classes based on date properties for styling.
            if (isWeekend) {
                dayElement.classList.add('weekend');
            }
            if (isBankHoliday) {
                dayElement.classList.add('bank-holiday'); // Apply bank holiday style
            }
            // Apply eligible-working-day class only if it's within the analysis range and is indeed an eligible day
            // and NOT a bank holiday AND NOT manually excluded.
            // Defensive check for `this.eligibleWorkingDates` type just in case.
            let isEligibleWorkingDay = (this.eligibleWorkingDates instanceof Set) ? this.eligibleWorkingDates.has(dateString) : false;

            if (this.analysisStartDate && this.analysisEndDate &&
                date >= new Date(this.analysisStartDate.getFullYear(), this.analysisStartDate.getMonth(), this.analysisStartDate.getDate()) &&
                date <= new Date(this.analysisEndDate.getFullYear(), this.analysisEndDate.getMonth(), this.analysisEndDate.getDate()) &&
                isEligibleWorkingDay && !isBankHoliday && !isExcluded) {
                dayElement.classList.add('eligible-working-day');
            }
            
            // Determine if the day is considered 'visited' for display purposes
            const isEffectivelyVisited = isVisitedFromBackend || isManualVisited;
            if (isEffectivelyVisited) {
                dayElement.classList.add('visited-day');
                const indicator = document.createElement('div');
                indicator.className = 'day-indicator';
                indicator.textContent = 'Visited';
                dayElement.appendChild(indicator);
            }
            if (isExcluded) { // Apply excluded style
                dayElement.classList.add('excluded-day');
            }
            if (isManualVisited) { // Style for manually added visited days
                dayElement.classList.add('manual-visited-day');
            }


            // Add click listener to toggle exclusion for any day on the calendar
            // Add double-click listener to toggle manual visited status
            
            // Single click to toggle exclusion from working days
            dayElement.addEventListener('click', (event) => {
                // Prevent dblclick from firing after single click
                if (this.clickTimeout) {
                    clearTimeout(this.clickTimeout);
                    this.clickTimeout = null;
                }
                this.clickTimeout = setTimeout(() => {
                    this.toggleExcludeDay(dateString, dayElement);
                    this.clickTimeout = null;
                }, 200); // Small delay to allow dblclick to register
            });

            // Double click to toggle manual visited status
            dayElement.addEventListener('dblclick', (event) => {
                if (this.clickTimeout) { // Clear single click timeout if dblclick occurs
                    clearTimeout(this.clickTimeout);
                    this.clickTimeout = null;
                }
                event.stopPropagation();
                // Allow toggling manual visited for any day not originally visited from backend
                // This includes days that are currently excluded.
                if (!isVisitedFromBackend || this.manualVisitedDates.has(dateString)) {
                    this.toggleManualVisitedDay(dateString, dayElement);
                } else {
                    console.log(`Day ${dateString} is already visited from timeline data. Cannot manually toggle.`);
                }
            });

            grid.appendChild(dayElement);
        }
    }

    // Toggle exclusion state for a day (from eligible working days)
    toggleExcludeDay(dateString, dayElement) {
        // If the day is currently manually visited, remove it from manual visited list first
        if (this.manualVisitedDates.has(dateString)) {
            this.manualVisitedDates.delete(dateString);
            localStorage.setItem('manualVisitedDates', JSON.stringify(Array.from(this.manualVisitedDates)));
            dayElement.classList.remove('manual-visited-day');
            // If it was only manually visited, remove the 'visited-day' class too
            if (!this.visitedDates.has(dateString)) {
                dayElement.classList.remove('visited-day');
                const indicator = dayElement.querySelector('.day-indicator');
                if (indicator) indicator.remove();
            }
        }

        // Now toggle exclusion
        if (this.excludedDates.has(dateString)) {
            this.excludedDates.delete(dateString);
            dayElement.classList.remove('excluded-day');
            // Re-apply eligible-working-day if it was removed due to exclusion and is still eligible
            if (this.eligibleWorkingDates.has(dateString) && !UK_BANK_HOLIDAYS_FRONTEND.has(dateString) &&
                dayElement.classList.contains('weekend') === false) { // Ensure it's not a weekend
                dayElement.classList.add('eligible-working-day');
            }
        } else {
            this.excludedDates.add(dateString);
            dayElement.classList.add('excluded-day');
            dayElement.classList.remove('eligible-working-day'); // Ensure it's removed if it was there
        }
        localStorage.setItem('excludedDates', JSON.stringify(Array.from(this.excludedDates)));
        
        // Trigger the analysis refresh via the callback
        if (this.onAnalysisRefreshCallback) {
            this.onAnalysisRefreshCallback();
        }
        console.log(`Toggled exclusion for ${dateString}. Current excluded dates:`, Array.from(this.excludedDates));
    }

    // Toggle manual visited state for a day
    toggleManualVisitedDay(dateString, dayElement) {
        // If the day is currently excluded, remove it from excluded list first
        if (this.excludedDates.has(dateString)) {
            this.excludedDates.delete(dateString);
            localStorage.setItem('excludedDates', JSON.stringify(Array.from(this.excludedDates)));
            dayElement.classList.remove('excluded-day');
            // Re-apply eligible-working-day if it was removed due to exclusion and is still eligible
            if (this.eligibleWorkingDates.has(dateString) && !UK_BANK_HOLIDAYS_FRONTEND.has(dateString) &&
                dayElement.classList.contains('weekend') === false) {
                dayElement.classList.add('eligible-working-day');
            }
        }

        // Now toggle manual visited
        if (this.manualVisitedDates.has(dateString)) {
            this.manualVisitedDates.delete(dateString);
            dayElement.classList.remove('manual-visited-day');
            // If it was only manually visited, remove the 'visited-day' class too
            if (!this.visitedDates.has(dateString)) { // Check if it was NOT originally visited from backend
                dayElement.classList.remove('visited-day');
                // Also remove the 'Visited' indicator
                const indicator = dayElement.querySelector('.day-indicator');
                if (indicator) indicator.remove();
            }
        } else {
            this.manualVisitedDates.add(dateString);
            dayElement.classList.add('manual-visited-day');
            dayElement.classList.add('visited-day'); // Ensure it gets the visited style
            // Add 'Visited' indicator if not already present
            if (!dayElement.querySelector('.day-indicator')) {
                const indicator = document.createElement('div');
                indicator.className = 'day-indicator';
                indicator.textContent = 'Visited';
                dayElement.appendChild(indicator);
            }
        }
        localStorage.setItem('manualVisitedDates', JSON.stringify(Array.from(this.manualVisitedDates)));
        
        // Trigger the analysis refresh via the callback
        if (this.onAnalysisRefreshCallback) {
            this.onAnalysisRefreshCallback();
        }
        console.log(`Toggled manual visited for ${dateString}. Current manual visited dates:`, Array.from(this.manualVisitedDates));
    }

    // Changes the displayed month by the given offset (-1 for previous, 1 for next).
    changeMonth(offset) {
        this.currentMonth.setMonth(this.currentMonth.getMonth() + offset);
        this.render(); // Re-render the calendar for the new month
    }
}


// --- Main Frontend Logic to interact with the Node.js backend ---
document.addEventListener('DOMContentLoaded', () => {
    // Check Google auth status and update the auth bar
    (async () => {
        try {
            const res = await fetch('/auth/status');
            const data = await res.json();
            if (data.authenticated) {
                document.getElementById('authLoggedOut').style.display = 'none';
                document.getElementById('authLoggedIn').style.display = 'inline';
                document.getElementById('authUserName').textContent = data.user.name || data.user.email;
            }
        } catch {
            // Server may not be running; auth bar stays in logged-out state
        }
    })();

    // Get references to the HTML elements.
    const placeIdInput = document.getElementById('placeIdInput');
    const datePicker = document.getElementById('datePicker'); // Reference to your custom component
    const analyzeButton = document.getElementById('analyzeButton');
    const resultsPre = document.getElementById('results');
    const calendarContainer = document.getElementById('calendarContainer');

    // Function to run the analysis, now reusable
    const runAnalysis = async () => {
        // Get values from the input fields and the custom date picker component.
        const placeId = placeIdInput.value.trim(); // Trim whitespace
        const startDate = datePicker.getStartDatetimeISO();
        const endDate = datePicker.getEndDatetimeISO();
        const excludedDates = Array.from(calendar.excludedDates); // Get excluded dates from calendar
        const manualVisitedDates = Array.from(calendar.manualVisitedDates); // Get manual visited dates

        // Basic validation for inputs.
        if (!placeId) {
            resultsPre.textContent = "Error: Please enter a Place ID.";
            return;
        }
        if (!startDate || !endDate) {
            resultsPre.textContent = "Error: Please select valid start and end dates/times.";
            return;
        }

        resultsPre.textContent = "Analyzing data... Please wait."; // Show a loading message
        calendarContainer.innerHTML = '<p style="text-align: center; color: #777;">Loading calendar data...</p>'; // Clear and show loading for calendar

        // Construct the URL for your Node.js backend API.
        // encodeURIComponent is crucial for properly handling special characters in URL parameters.
        const apiUrl = `http://127.0.0.1:3000/analyze?placeId=${encodeURIComponent(placeId)}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&excludedDates=${encodeURIComponent(JSON.stringify(excludedDates))}&manualVisitedDates=${encodeURIComponent(JSON.stringify(manualVisitedDates))}`; // Add manualVisitedDates

        try {
            // Make a fetch request to your Node.js server.
            const response = await fetch(apiUrl);
            // Parse the JSON response from the server.
            const data = await response.json();

            // Check if the HTTP response was successful (status code 2xx).
            if (response.ok) {
                // Format results for display
                let formattedResults = `
Visits: ${data.totalUniqueVisitDays}
Working days: ${data.totalEligibleWorkingDays}
Average: ${data.averageVisitsPerWorkingWeek}
                `;
                resultsPre.textContent = formattedResults;

                // Update and render the calendar with the new data
                // Pass the original start/end dates to calendar.setDates for correct range highlighting
                calendar.setDates(data.visitedDates, data.eligibleWorkingDates, startDate, endDate);

            } else {
                // Display error message from the server.
                resultsPre.textContent = `Error from server: ${data.error || 'Unknown server error'}`;
                calendarContainer.innerHTML = `<p style="text-align: center; color: red;">Error loading calendar: ${data.error || 'Unknown error'}</p>`;
            }
        } catch (error) {
            // Catch network errors or issues with fetch itself.
            console.error('Error fetching data:', error);
            resultsPre.textContent = `Failed to connect to the server or an unexpected error occurred: ${error.message}`;
            calendarContainer.innerHTML = `<p style="text-align: center; color: red;">Failed to connect to server.</p>`;
        }
    };

    // Initialize calendar renderer, passing the debounced runAnalysis function as a callback
    const debouncedRunAnalysis = debounce(runAnalysis, 300); // Debounce by 300ms
    const calendar = new CalendarRenderer('calendarContainer', debouncedRunAnalysis);


    // Try to load saved Place ID from local storage
    const savedPlaceId = localStorage.getItem('placeId');
    if (savedPlaceId) {
        placeIdInput.value = savedPlaceId;
    } else {
        // Set default Place ID if nothing is saved
        placeIdInput.value = "ChIJmW6qHk0bdkgR0SPHeuB6bzs";
    }

    // Add event listener to save Place ID changes to local storage
    placeIdInput.addEventListener('change', () => {
        localStorage.setItem('placeId', placeIdInput.value.trim());
    });


    // Add an event listener to the "Analyze Visits" button.
    analyzeButton.addEventListener('click', runAnalysis); // Direct call for button click

    // Add an event listener to the "Last 90 Days" button.
    const last90DaysButton = document.getElementById('last90DaysButton');
    last90DaysButton.addEventListener('click', () => {
        const today = new Date();
        const startDate90DaysAgo = new Date();
        startDate90DaysAgo.setDate(today.getDate() - 90);
        
        datePicker.setDateRange(startDate90DaysAgo, today);
        runAnalysis(); // Automatically run analysis after setting dates
    });

    // Initial analysis run when the page loads
    runAnalysis();
});

// Export utilities for unit testing (guard prevents this from running in the browser)
if (typeof module !== 'undefined') {
    module.exports = { debounce, CalendarRenderer, DateRangePicker };
}
