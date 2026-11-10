import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-read-night-'));
  tempDirs.push(dir);
  return dir;
}

function tempDirWithFile(name: string, contents: string): string {
  const dir = tempDir();
  writeFileSync(join(dir, `${name}.jsonl`), contents);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real 2026-10-28 night: 5 jobs, 1 bad line', () => {
    const night = readNight('runs', '2026-10-28');
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(night?.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts every valid line of 2026-10-27 as ok', () => {
    const night = readNight('runs', '2026-10-27');
    expect(night?.counts).toEqual({ ok: 7, retry: 0, fail: 0 });
  });

  it('summarizes fixtures/refresh: 4 runs, 3 retries, last status ok', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((row) => row.job === 'fixtures/refresh');
    expect(row).toBeDefined();
    expect(row?.runs).toBe(4);
    expect(row?.retries).toBe(3);
    expect(row?.lastStatus).toBe('ok');
    expect(row?.lastError).toBe('upstream 503');
  });

  it('keeps notes/backup as a fail row with its error', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((row) => row.job === 'notes/backup');
    expect(row).toMatchObject({
      job: 'notes/backup',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
    });
  });

  it('keeps a null owner and the exact offsets', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((row) => row.job === 'digest/render');
    expect(row).toBeDefined();
    expect(row?.owner).toBeNull();
    expect(row?.firstAt).toBe('2026-10-29T05:41:09+01:00');
    expect(row?.lastAt).toBe('2026-10-29T05:41:09+01:00');
  });

  it('does not clear a last error after a later ok line', () => {
    const row = readNight('runs', '2026-10-28')?.rows.find((row) => row.job === 'lane/sync');
    expect(row?.lastStatus).toBe('ok');
    expect(row?.lastError).toBe('lock held');
  });

  it('returns null for a missing night', () => {
    expect(readNight(tempDir(), '2026-01-01')).toBeNull();
  });

  it('reads an empty file as no runs and no bad lines', () => {
    const night = readNight(tempDirWithFile('2026-01-02', ''), '2026-01-02');
    expect(night).toEqual({
      night: '2026-01-02',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });
});
