const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');
const { analyzeTimelineData } = require('./analyzer');

const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 3000;

const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50 MB

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                if (!tooLarge) {
                    tooLarge = true;
                    req.resume(); // drain without closing socket so caller can still send 413
                    const err = new Error('Payload too large');
                    err.code = 'PAYLOAD_TOO_LARGE';
                    reject(err);
                }
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
        req.on('error', reject);
    });
}

// Create the HTTP server
const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);

    // Upload timeline data file
    if (reqUrl.pathname === '/upload-timeline' && req.method === 'POST') {
        try {
            const raw = await readBody(req);
            let data;
            try { data = JSON.parse(raw); } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }
            if (!data || !Array.isArray(data.semanticSegments)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File must contain a semanticSegments array' }));
                return;
            }
            await fs.promises.writeFile(path.join(__dirname, 'timeline.json'), raw);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, segments: data.semanticSegments.length }));
        } catch (err) {
            if (err.code === 'PAYLOAD_TOO_LARGE') {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File too large (50 MB limit)' }));
            } else {
                console.error('Upload error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Upload failed' }));
            }
        }
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
        return;
    }

    // Serve static files — explicit allowlist to prevent path traversal and info disclosure
    const STATIC = {
        '/':                       ['index.html',          'text/html'],
        '/index.html':             ['index.html',          'text/html'],
        '/frontend.js':            ['frontend.js',         'application/javascript'],
        '/archive_browser.html':   ['archive_browser.html','text/html'],
    };
    const entry = STATIC[reqUrl.pathname];
    if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
    }
    const [filename, contentType] = entry;
    fs.readFile(path.join(__dirname, filename), (err, data) => {
        if (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Server Error: ${err.code}`);
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        }
    });
});

// Start the server
server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
    console.log(`Open your browser to: http://${hostname}:${port}/`);
    console.log(`Upload your Timeline.json via the browser interface to begin analysis.`);
});
