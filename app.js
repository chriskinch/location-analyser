require('dotenv').config();
const http = require('http');
const fs = require('fs');
const url = require('url');
const path = require('path');
const crypto = require('crypto');
const { analyzeTimelineData } = require('./analyzer');

const hostname = '127.0.0.1';
const port = 3000;

// --- Google OAuth setup ---
const REDIRECT_URI = `http://${hostname}:${port}/auth/callback`;
const SCOPES = ['openid', 'email', 'profile'];

let OAuth2Client;
try {
    ({ OAuth2Client } = require('google-auth-library'));
} catch {
    // google-auth-library not installed; run `npm install`
}

function createOAuth2Client() {
    if (!OAuth2Client) throw new Error('Run `npm install` to install dependencies.');
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in a .env file (see .env.example).');
    }
    return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

// --- In-memory session store ---
const sessions = new Map();

function parseCookies(req) {
    const cookies = {};
    (req.headers.cookie || '').split(';').forEach(part => {
        const [k, ...v] = part.split('=');
        if (k) cookies[k.trim()] = v.join('=').trim();
    });
    return cookies;
}

function getSessionData(req) {
    const { session_id } = parseCookies(req);
    return session_id ? sessions.get(session_id) : null;
}

// --- HTTP server ---
const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    const filePath = path.join(__dirname, reqUrl.pathname);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // --- Auth: initiate OAuth flow ---
    if (reqUrl.pathname === '/auth/google' && req.method === 'GET') {
        try {
            const client = createOAuth2Client();
            const authUrl = client.generateAuthUrl({
                access_type: 'online',
                scope: SCOPES,
                prompt: 'select_account',
            });
            res.writeHead(302, { Location: authUrl });
            res.end();
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end(`<h2>Configuration error</h2><p>${err.message}</p><p><a href="/">Back</a></p>`);
        }
        return;
    }

    // --- Auth: OAuth callback ---
    if (reqUrl.pathname === '/auth/callback' && req.method === 'GET') {
        const code = reqUrl.query.code;
        if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing authorization code');
            return;
        }
        try {
            const client = createOAuth2Client();
            const { tokens } = await client.getToken(code);
            client.setCredentials(tokens);

            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();

            const sessionId = crypto.randomBytes(32).toString('hex');
            sessions.set(sessionId, {
                user: { email: payload.email, name: payload.name },
                tokens,
            });

            res.setHeader('Set-Cookie', `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);
            res.writeHead(302, { Location: '/' });
            res.end();
        } catch (err) {
            console.error('OAuth callback error:', err);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h2>Authentication failed</h2><p>Check server logs for details.</p><p><a href="/">Back</a></p>');
        }
        return;
    }

    // --- Auth: logout ---
    if (reqUrl.pathname === '/auth/logout' && req.method === 'GET') {
        const { session_id } = parseCookies(req);
        if (session_id) sessions.delete(session_id);
        res.setHeader('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        res.writeHead(302, { Location: '/' });
        res.end();
        return;
    }

    // --- Auth: status ---
    if (reqUrl.pathname === '/auth/status' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        const sessionData = getSessionData(req);
        if (sessionData && sessionData.user) {
            res.writeHead(200);
            res.end(JSON.stringify({ authenticated: true, user: sessionData.user }));
        } else {
            res.writeHead(200);
            res.end(JSON.stringify({ authenticated: false }));
        }
        return;
    }

    // --- Analysis endpoint ---
    if (reqUrl.pathname === '/analyze' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        const { placeId, startDate, endDate, excludedDates, manualVisitedDates } = reqUrl.query;

        if (!placeId || !startDate || !endDate) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing parameters: placeId, startDate, and endDate are required.' }));
            return;
        }

        try {
            const results = await analyzeTimelineData(placeId, startDate, endDate, excludedDates, manualVisitedDates);
            res.statusCode = 200;
            res.end(JSON.stringify(results));
        } catch (error) {
            console.error("Analysis error:", error);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: error.message || 'An error occurred during analysis.' }));
        }
        return;
    }

    // --- Static file serving ---
    let contentType = 'text/html';
    if (reqUrl.pathname.endsWith('.js')) contentType = 'application/javascript';
    else if (reqUrl.pathname.endsWith('.css')) contentType = 'text/css';

    const staticPath = filePath === path.join(__dirname, '/') ? path.join(__dirname, 'index.html') : filePath;
    fs.readFile(staticPath, (err, data) => {
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
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
    console.log(`Open your browser to: http://${hostname}:${port}/`);
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.log(`\nNo GOOGLE_CLIENT_ID found. Copy .env.example to .env and add your credentials to enable Google login.`);
    }
});
