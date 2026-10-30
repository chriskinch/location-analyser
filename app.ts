import http from 'http';
import fs from 'fs';
import url from 'url';
import path from 'path';
import { analyzeTimelineData } from './analyzer';
import type { SavedState, TimelineData } from './types';

// Compiled to dist/; HTML pages and timeline.json live at the repo root.
const ROOT = path.join(__dirname, '..');

const hostname = process.env.HOST || '127.0.0.1';
const port = (() => {
    const raw = process.env.PORT;
    if (!raw) return 3000;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
        throw new Error(`Invalid PORT environment variable: "${raw}"`);
    }
    return n;
})();

const MAX_BODY_BYTES = 200 * 1024 * 1024; // 200 MB

function readBody(req: http.IncomingMessage, limit = MAX_BODY_BYTES): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let tooLarge = false;
        req.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > limit) {
                if (!tooLarge) {
                    tooLarge = true;
                    req.resume(); // drain without closing socket so caller can still send 413
                    reject(Object.assign(new Error('Payload too large'), { code: 'PAYLOAD_TOO_LARGE' }));
                }
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => { if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8')); });
        req.on('error', reject);
    });
}

// Saved selections shared by every browser on this machine. Values are the same strings the frontend keeps in localStorage.
const STATE_FILE = path.join(ROOT, 'state.json');
const STATE_KEYS = new Set(['startDate', 'startTime', 'endDate', 'endTime', 'placeId', 'excludedDates', 'manualVisitedDates']);
const DATE_LIST_KEYS = new Set(['excludedDates', 'manualVisitedDates']);
const MAX_STATE_BYTES = 64 * 1024;
// Only answer /state for our own origin, so a DNS-rebinding page can't read or write it.
// Browsers omit the port from Host when it is 80, and bracket IPv6 addresses (HOST=::1 -> [::1]).
const STATE_HOSTS = new Set(['127.0.0.1', 'localhost', hostname.includes(':') ? `[${hostname}]` : hostname]
    .map(h => port === 80 ? h : `${h}:${port}`));

function readState(): SavedState {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
        throw err;
    }
}

// Returns an error message, or null if body is a valid partial state.
function validateState(body: unknown): string | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Body must be a JSON object';
    for (const [key, value] of Object.entries(body)) {
        if (!STATE_KEYS.has(key)) return `Unknown key: ${key}`;
        if (typeof value !== 'string') return `${key} must be a string`;
        if (DATE_LIST_KEYS.has(key)) {
            let list: unknown;
            try { list = JSON.parse(value); } catch { list = null; }
            if (!Array.isArray(list) || !list.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d))) {
                return `${key} must be a JSON array of YYYY-MM-DD dates`;
            }
        }
    }
    return null;
}

// Write to a temp file then rename, so a crash mid-write never leaves a truncated state.json.
// Sync on purpose: concurrent requests can't interleave their read-merge-write.
function writeState(state: SavedState) {
    const tmp = `${STATE_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE);
}

// Create the HTTP server
const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url!, true);

    // Upload timeline data file
    if (reqUrl.pathname === '/upload-timeline' && req.method === 'POST') {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('application/json')) {
            res.writeHead(415, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
            return;
        }
        try {
            const raw = await readBody(req);
            let data: TimelineData;
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
            await fs.promises.writeFile(path.join(ROOT, 'timeline.json'), raw);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, segments: data.semanticSegments.length }));
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'PAYLOAD_TOO_LARGE') {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File too large (200 MB limit)' }));
            } else {
                console.error('Upload error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Upload failed' }));
            }
        }
        return;
    }

    // Saved selections: GET returns them ({} if none yet), PATCH merges the keys sent (per-key last write wins).
    // PATCH ?ifEmpty=1 writes only if nothing is saved yet, so two browsers migrating at once can't overwrite each other.
    if (reqUrl.pathname === '/state' && (req.method === 'GET' || req.method === 'PATCH')) {
        const send = (status: number, body: unknown) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
        };
        if (!STATE_HOSTS.has(req.headers.host || '')) return send(403, { error: 'Forbidden' });
        try {
            if (req.method === 'GET') return send(200, readState());
            if (!(req.headers['content-type'] || '').includes('application/json')) {
                return send(415, { error: 'Content-Type must be application/json' });
            }
            let body: unknown;
            try { body = JSON.parse(await readBody(req, MAX_STATE_BYTES)); } catch (err) {
                if ((err as NodeJS.ErrnoException).code === 'PAYLOAD_TOO_LARGE') return send(413, { error: 'State too large (64 KB limit)' });
                return send(400, { error: 'Invalid JSON' });
            }
            const invalid = validateState(body);
            if (invalid) return send(400, { error: invalid });
            const current = readState();
            if (reqUrl.query.ifEmpty && Object.keys(current).length > 0) return send(200, current);
            const state = { ...current, ...(body as SavedState) };
            writeState(state);
            return send(200, state);
        } catch (err) {
            console.error('State error:', err);
            return send(500, { error: 'Could not read or write saved state' });
        }
    }

    // API endpoint for analysis
    if (reqUrl.pathname === '/analyze' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        // A repeated query param actually arrives as string[]; passed through unchanged, as before.
        const { placeId, startDate, endDate, excludedDates, manualVisitedDates } = reqUrl.query as Record<string, string | undefined>; // Get excluded and manual visited dates

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
            res.end(JSON.stringify({ error: (error as Error).message || 'An error occurred during analysis.' }));
        }
        return;
    }

    // Serve static files — explicit allowlist to prevent path traversal and info disclosure
    const STATIC: Record<string, [string, string]> = {
        '/':                       [path.join(ROOT, 'index.html'),           'text/html'],
        '/index.html':             [path.join(ROOT, 'index.html'),           'text/html'],
        '/frontend.js':            [path.join(__dirname, 'frontend.js'),     'application/javascript'],
        '/archive_browser.html':   [path.join(ROOT, 'archive_browser.html'), 'text/html'],
    };
    const entry: [string, string] | undefined = STATIC[reqUrl.pathname!];
    if (!entry) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
    }
    const [filePath, contentType] = entry;
    fs.readFile(filePath, (err, data) => {
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
