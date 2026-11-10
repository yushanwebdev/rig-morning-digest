import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestNight, DigestRow, DigestStatus } from './types.js';

/** One valid log line, after validation at the edge. */
type RunLine = {
  at: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is DigestStatus {
  return typeof value === 'string' && STATUSES.includes(value);
}

function isRunLine(value: unknown): value is RunLine {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string') return false;
  if (!isStatus(o.status)) return false;
  if (o.owner !== null && typeof o.owner !== 'string') return false;
  if (o.error !== undefined && typeof o.error !== 'string') return false;
  return true;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Read `runsDir/<night>.jsonl` into one {@link DigestRow} per job.
 * See the contract on the declared function in `types.ts`.
 */
export function readNight(runsDir: string, night: string): DigestNight | null {
  const file = join(runsDir, `${night}.jsonl`);

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return null;
    throw error;
  }

  let badLines = 0;
  const counts = { ok: 0, retry: 0, fail: 0 };
  const jobs = new Map<string, DigestRow>();

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      badLines += 1;
      continue;
    }

    if (!isRunLine(parsed)) {
      badLines += 1;
      continue;
    }

    const run = parsed;
    counts[run.status] += 1;
    const row = jobs.get(run.job);
    if (row === undefined) {
      jobs.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
    } else {
      row.runs += 1;
      if (run.status === 'retry') row.retries += 1;
      row.owner = run.owner;
      row.lastStatus = run.status;
      if (run.error !== undefined) row.lastError = run.error;
      row.lastAt = run.at;
    }
  }

  const rows = [...jobs.values()].sort((a, b) =>
    a.job < b.job ? -1 : a.job > b.job ? 1 : 0,
  );

  return { night, rows, counts, badLines };
}
