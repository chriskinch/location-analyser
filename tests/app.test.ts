import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'timeline.test.json');

// Compile the server once per run so these tests exercise the current source, not a stale dist/.
const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), 'location-analyser-build-'));
beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'),
        '-p', path.join(ROOT, 'tsconfig.server.json'), '--outDir', BUILD,
    ]);
}, 60_000);
afterAll(() => fs.rmSync(BUILD, { recursive: true, force: true }));

// dist/app.js listens as soon as it is loaded and reads/writes timeline.json in
// the directory above it, so each server runs as a child process from a
// throwaway copy in a temp dir. Uploads never touch the repo's real timeline.json.
async function startServer({ timeline }: { timeline?: string } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'location-analyser-'));
    fs.mkdirSync(path.join(dir, 'dist'));
    for (const f of ['app.js', 'analyzer.js']) {
        fs.copyFileSync(path.join(BUILD, f), path.join(dir, 'dist', f));
    }
    fs.copyFileSync(path.join(ROOT, 'index.html'), path.join(dir, 'index.html'));
    // dist/frontend.js is deliberately not copied, to exercise the static read-error path.
    if (timeline) fs.copyFileSync(timeline, path.join(dir, 'timeline.json'));

    const port = await new Promise<number>(resolve => {
        const s = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = s.address() as net.AddressInfo;
            s.close(() => resolve(port));
        });
    });

    const child = spawn(process.execPath, [path.join('dist', 'app.js')], {
        cwd: dir,
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) },
    });
    await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (d: Buffer) => { if (d.toString().includes('Server running')) resolve(); });
        child.on('exit', code => reject(new Error(`server exited early with code ${code}`)));
    });

    return {
        dir,
        base: `http://127.0.0.1:${port}`,
        stop() {
            child.kill();
            fs.rmSync(dir, { recursive: true, force: true });
        },
    };
}

function analyzeUrl(base: string, params: Record<string, string>) {
    return `${base}/analyze?${new URLSearchParams(params)}`;
}

const WEEK = {
    placeId: 'test-place-id',
    startDate: '2024-01-15T00:00:00.000Z',
    endDate: '2024-01-19T23:59:59.000Z',
};

describe('static file allowlist', () => {
    let srv: Awaited<ReturnType<typeof startServer>>;
    beforeAll(async () => { srv = await startServer(); });
    afterAll(() => srv.stop());

    it('serves index.html at /', async () => {
        const res = await fetch(`${srv.base}/`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/html');
        expect(await res.text()).toBe(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    });

    it.each(['/app.js', '/analyzer.js', '/timeline.json', '/package.json', '/nope'])(
        'returns 404 for non-allowlisted path %s',
        async p => {
            const res = await fetch(`${srv.base}${p}`);
            expect(res.status).toBe(404);
            expect(await res.text()).toBe('404 Not Found');
        }
    );

    // fetch normalizes dot segments, so send these raw with http.get.
    it.each(['/../app.js', '/%2e%2e/app.js', '/..%2fapp.js'])(
        'returns 404 for traversal path %s',
        async p => {
            const status = await new Promise<number | undefined>((resolve, reject) => {
                http.get(`${srv.base}/`, { path: p }, res => { res.resume(); resolve(res.statusCode); })
                    .on('error', reject);
            });
            expect(status).toBe(404);
        }
    );

    it('returns 404 for GET /upload-timeline (POST only)', async () => {
        const res = await fetch(`${srv.base}/upload-timeline`);
        expect(res.status).toBe(404);
    });

    it('returns 500 when an allowlisted file cannot be read', async () => {
        const res = await fetch(`${srv.base}/frontend.js`);
        expect(res.status).toBe(500);
        expect(await res.text()).toBe('Server Error: ENOENT');
    });
});

describe('GET /analyze', () => {
    describe('with timeline data', () => {
        let srv: Awaited<ReturnType<typeof startServer>>;
        beforeAll(async () => { srv = await startServer({ timeline: FIXTURE }); });
        afterAll(() => srv.stop());

        it('returns 200 with the analysis result', async () => {
            const res = await fetch(analyzeUrl(srv.base, WEEK));
            expect(res.status).toBe(200);
            expect(res.headers.get('content-type')).toBe('application/json');
            const body = await res.json();
            expect(body.totalUniqueVisitDays).toBe(2);
            expect(body.totalEligibleWorkingDays).toBe(5);
            expect(body.visitedDates).toEqual(['2024-01-15', '2024-01-16']);
        });

        it('passes excludedDates and manualVisitedDates through', async () => {
            const res = await fetch(analyzeUrl(srv.base, {
                ...WEEK,
                excludedDates: JSON.stringify(['2024-01-19']),
                manualVisitedDates: JSON.stringify(['2024-01-18']),
            }));
            const body = await res.json();
            expect(body.totalEligibleWorkingDays).toBe(4);
            expect(body.visitedDates).toContain('2024-01-18');
        });

        it.each(['placeId', 'startDate', 'endDate'])('returns 400 when %s is missing', async key => {
            const params: Record<string, string> = { ...WEEK };
            delete params[key];
            const res = await fetch(analyzeUrl(srv.base, params));
            expect(res.status).toBe(400);
            expect((await res.json()).error).toMatch(/Missing parameters/);
        });

        it('returns 500 for an invalid date', async () => {
            const res = await fetch(analyzeUrl(srv.base, { ...WEEK, startDate: 'not-a-date' }));
            expect(res.status).toBe(500);
            expect((await res.json()).error).toMatch(/Invalid start or end date/);
        });

        it('returns 500 for malformed excludedDates JSON', async () => {
            const res = await fetch(analyzeUrl(srv.base, { ...WEEK, excludedDates: '[not json' }));
            expect(res.status).toBe(500);
        });
    });

    describe('without timeline data', () => {
        let srv: Awaited<ReturnType<typeof startServer>>;
        beforeAll(async () => { srv = await startServer(); });
        afterAll(() => srv.stop());

        it('returns 500 when timeline.json is missing', async () => {
            const res = await fetch(analyzeUrl(srv.base, WEEK));
            expect(res.status).toBe(500);
            expect((await res.json()).error).toMatch(/Failed to read timeline data/);
        });
    });
});

describe('POST /upload-timeline', () => {
    let srv: Awaited<ReturnType<typeof startServer>>;
    beforeAll(async () => { srv = await startServer(); });
    afterAll(() => srv.stop());

    const post = (body: string, contentType = 'application/json') =>
        fetch(`${srv.base}/upload-timeline`, {
            method: 'POST',
            headers: { 'Content-Type': contentType },
            body,
        });

    it('returns 415 for a non-JSON content type', async () => {
        const res = await post('{}', 'text/plain');
        expect(res.status).toBe(415);
        expect((await res.json()).error).toMatch(/application\/json/);
    });

    it('returns 400 for invalid JSON', async () => {
        const res = await post('{not json');
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Invalid JSON');
    });

    it.each([['{}'], ['null'], ['{"semanticSegments":{}}']])(
        'returns 400 when semanticSegments is not an array (%s)',
        async body => {
            const res = await post(body);
            expect(res.status).toBe(400);
            expect((await res.json()).error).toMatch(/semanticSegments/);
        }
    );

    it('returns 200, writes timeline.json and makes it available to /analyze', async () => {
        const raw = fs.readFileSync(FIXTURE, 'utf8');
        const res = await post(raw);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, segments: JSON.parse(raw).semanticSegments.length });
        expect(fs.readFileSync(path.join(srv.dir, 'timeline.json'), 'utf8')).toBe(raw);

        const analysis = await fetch(analyzeUrl(srv.base, WEEK));
        expect(analysis.status).toBe(200);
    });

    it('returns 413 for a body over 200 MB', async () => {
        const chunk = Buffer.alloc(1024 * 1024, 0x20); // 1 MB of spaces
        const status = await new Promise<number | undefined>((resolve, reject) => {
            const req = http.request(`${srv.base}/upload-timeline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            let done = false;
            req.on('response', res => { done = true; res.resume(); resolve(res.statusCode); req.destroy(); });
            req.on('error', err => { if (!done) reject(err); });
            let sent = 0;
            const pump = (): void => {
                while (!done && sent <= 201) {
                    sent++;
                    if (!req.write(chunk)) { req.once('drain', pump); return; }
                }
                if (!done) req.end();
            };
            pump();
        });
        expect(status).toBe(413);
    }, 30_000);
});
