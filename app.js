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
    console.warn('WARNING: google-auth-library not found. Run `npm install` to enable Google login.');
}

function createOAuth2Client() {
    if (!OAuth2Client) throw new Error('Run `npm install` to install dependencies.');
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
        throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in a .env file (see .env.example).');
    }
    return new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, REDIRECT_URI);
}

// --- In-memory session store ---
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const sessions = new Map();

// Purge expired sessions every hour
setInterval(() => {
    const now = Date.now();
    for (const [id, data] of sessions) {
        if (data.expiresAt < now) sessions.delete(id);
    }
}, 60 * 60 * 1000).unref();

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
    if (!session_id) return null;
    const data = sessions.get(session_id);
    if (!data) return null;
    if (data.expiresAt < Date.now()) {
        sessions.delete(session_id);
        return null;
    }
    return data;
}

// --- HTTP server ---
const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);


    // --- Auth: initiate OAuth flow ---
    if (reqUrl.pathname === '/auth/google' && req.method === 'GET') {
        try {
            const client = createOAuth2Client();
            const state = crypto.randomBytes(16).toString('hex');
            // Short-lived state cookie scoped to the callback path only
            res.setHeader('Set-Cookie', `oauth_state=${state}; HttpOnly; Path=/auth/callback; SameSite=Lax; Max-Age=300`);
            const authUrl = client.generateAuthUrl({
                access_type: 'online',
                scope: SCOPES,
                prompt: 'select_account',
                state,
            });
            res.writeHead(302, { Location: authUrl });
            res.end();
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Configuration error: ${err.message}`);
        }
        return;
    }

    // --- Auth: OAuth callback ---
    if (reqUrl.pathname === '/auth/callback' && req.method === 'GET') {
        const { code, state } = reqUrl.query;
        const { oauth_state } = parseCookies(req);

        if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing authorization code');
            return;
        }
        if (!oauth_state || !state || oauth_state !== state) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid state parameter');
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
                expiresAt: Date.now() + SESSION_TTL_MS,
            });

            // Clear the one-time state cookie and set the session cookie.
            // Secure flag intentionally omitted: this server runs on HTTP locally.
            // Max-Age matches the server-side SESSION_TTL_MS (24h).
            res.setHeader('Set-Cookie', [
                'oauth_state=; HttpOnly; Path=/auth/callback; Max-Age=0; SameSite=Lax',
                `session_id=${sessionId}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`,
            ]);
            res.writeHead(302, { Location: '/' });
            res.end();
        } catch (err) {
            console.error('OAuth callback error:', err);
            res.writeHead(500, { 'Content-Type': 'text/html' });
            res.end('<h2>Authentication failed</h2><p>Check server logs for details.</p><p><a href="/">Back</a></p>');
        }
        return;
    }

    // --- Auth: logout (POST to prevent CSRF via GET) ---
    if (reqUrl.pathname === '/auth/logout' && req.method === 'POST') {
        const { session_id } = parseCookies(req);
        if (session_id) sessions.delete(session_id);
        res.setHeader('Set-Cookie', 'session_id=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // --- Auth: status ---
    if (reqUrl.pathname === '/auth/status' && req.method === 'GET') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
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
    const reqPath = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '');

    // Block dotfiles and dotdirectories (e.g. /.env, /.git/config)
    if (reqPath.split('/').some(seg => seg.startsWith('.'))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    const staticPath = path.resolve(__dirname, reqPath);

    // Guard against directory traversal — path.relative is cross-platform safe
    const relative = path.relative(__dirname, staticPath);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    let contentType = 'text/html';
    if (reqUrl.pathname.endsWith('.js')) contentType = 'application/javascript';
    else if (reqUrl.pathname.endsWith('.css')) contentType = 'text/css';

    try {
        const data = await fs.promises.readFile(staticPath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`Server Error: ${err.code}`);
        }
    }
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`);
    console.log(`Open your browser to: http://${hostname}:${port}/`);
    if (!process.env.GOOGLE_CLIENT_ID) {
        console.log(`\nNo GOOGLE_CLIENT_ID found. Copy .env.example to .env and add your credentials to enable Google login.`);
    }
});
