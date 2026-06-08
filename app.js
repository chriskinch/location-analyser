const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');
const { analyzeTimelineData } = require('./analyzer');

const hostname = '127.0.0.1';
const port = 3000;

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
    console.log(`Make sure your 'timeline.json' and 'frontend.js' are in the same directory as this script.`);
});
