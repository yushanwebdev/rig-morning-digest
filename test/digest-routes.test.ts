import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestNight } from '../src/digest/types.js';

const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: 'runs',
};

const tempDirs: string[] = [];

function tempRunsDir(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(dir);
  for (const [night, contents] of Object.entries(files)) {
    writeFileSync(join(dir, `${night}.jsonl`), contents);
  }
  return dir;
}

function appFor(runsDir: string) {
  return createApp({ ...baseConfig, runsDir });
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const nightLog = [
  '{"at":"2026-11-01T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
  '{"at":"2026-11-01T23:05:00+01:00","job":"fixtures/refresh","status":"retry","owner":"rook","error":"upstream 503"}',
  '{"at":"2026-11-01T23:10:00+01:00","job":"notes/backup","status":"fail","owner":null,"error":"quota exceeded"}',
].join('\n');

describe('GET /digest/:night', () => {
  it("renders the night's rows, sorted by job", async () => {
    const res = await appFor(tempRunsDir({ '2026-11-01': nightLog })).request('/digest/2026-11-01');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('2026-11-01');
    for (const name of ['fixtures/refresh', 'lane/sync', 'notes/backup']) {
      expect(html).toContain(name);
    }
    expect(html.indexOf('fixtures/refresh')).toBeLessThan(html.indexOf('lane/sync'));
    expect(html.indexOf('lane/sync')).toBeLessThan(html.indexOf('notes/backup'));
    expect(html).toContain('<span class="mute">—</span>');
  });

  it('returns 404 for a night with no file', async () => {
    const res = await appFor(tempRunsDir()).request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('renders the empty night as "nothing ran"', async () => {
    const res = await appFor(tempRunsDir({ '2026-11-02': '' })).request('/digest/2026-11-02');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(html).not.toContain('<table>');
  });

  it('still renders a night with a bad line', async () => {
    const log = ['not json', '{"at":"2026-11-03T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}'].join('\n');
    const res = await appFor(tempRunsDir({ '2026-11-03': log })).request('/digest/2026-11-03');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('lane/sync');
  });
});

describe('GET /api/digest/:night', () => {
  it("returns the night's rows as JSON, sorted by job", async () => {
    const res = await appFor(tempRunsDir({ '2026-11-01': nightLog })).request('/api/digest/2026-11-01');
    const body = (await res.json()) as DigestNight;

    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-11-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((row) => row.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup']);
    expect(body.rows.find((row) => row.job === 'notes/backup')).toMatchObject({
      owner: null,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('returns 404 for a night with no file', async () => {
    const res = await appFor(tempRunsDir()).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no night', night: '2026-01-01' });
  });

  it('returns the empty night as no rows and no bad lines', async () => {
    const res = await appFor(tempRunsDir({ '2026-11-02': '' })).request('/api/digest/2026-11-02');
    const body = (await res.json()) as DigestNight;

    expect(res.status).toBe(200);
    expect(body).toEqual({ night: '2026-11-02', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('counts a bad line and still returns the rows', async () => {
    const log = ['not json', '{"at":"2026-11-03T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}'].join('\n');
    const res = await appFor(tempRunsDir({ '2026-11-03': log })).request('/api/digest/2026-11-03');
    const body = (await res.json()) as DigestNight;

    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(['lane/sync']);
  });
});
