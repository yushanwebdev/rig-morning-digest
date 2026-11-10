// Digest input: one night of runs/<night>.jsonl, read into one row per job.
// Contract only for now (plan morning-digest § 1). The reader is implemented against this.

/** A run's terminal status, exactly as written in the log. */
export type DigestStatus = 'ok' | 'retry' | 'fail';

/** How many valid log lines of the night had each terminal status. */
export type DigestCounts = {
  /** Lines with `status: "ok"`. */
  ok: number;
  /** Lines with `status: "retry"`. */
  retry: number;
  /** Lines with `status: "fail"`. */
  fail: number;
};

/** One job's night, summarized: one row per distinct `job` in the night's log. */
export type DigestRow = {
  /** The job name, exactly as in the log (`job`). */
  job: string;
  /**
   * Owner of the job's last line (file order), or `null` when that line's `owner` is `null`.
   * A null owner is kept on the row and shown as `—`, never dropped.
   */
  owner: string | null;
  /** How many lines the job has this night. Always `>= 1`. */
  runs: number;
  /** How many of those lines have `status: "retry"`. */
  retries: number;
  /** `status` of the job's last line (file order). */
  lastStatus: DigestStatus;
  /**
   * `error` of the most recent line for this job that carries one, or `null` when none does.
   * A later `ok` line does not clear it: this is the last error seen, not the last line's error.
   */
  lastError: string | null;
  /** `at` of the job's first line (file order). Offset kept exactly as written. */
  firstAt: string;
  /** `at` of the job's last line (file order). Offset kept exactly as written. */
  lastAt: string;
};

/** Everything one night's log read back: the rows, sorted by job, and what could not be parsed. */
export type DigestNight = {
  /** The night, `YYYY-MM-DD` (the file's basename without `.jsonl`). */
  night: string;
  /** One row per job, sorted by `job` ascending in plain, locale-independent string order. */
  rows: DigestRow[];
  /**
   * Totals over the night's valid lines, one per `status`. The sum equals the number of lines
   * that produced a {@link DigestRow} entry; bad lines are counted in `badLines`, not here.
   */
  counts: DigestCounts;
  /** Non-blank lines that were not a valid run object. Counted and skipped; never thrown. */
  badLines: number;
};

/**
 * Read `runsDir/<night>.jsonl` into one {@link DigestRow} per job.
 *
 * Contract:
 * - Returns `null` when the file does not exist, so the caller can answer 404. An existing but
 *   empty file returns `{ night, rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0 }`
 *   (rendered as "nothing ran").
 * - The log is JSONL: one JSON object per line with `at` (string), `job` (string),
 *   `status` (`ok | retry | fail`), `owner` (string or `null`) and optional `error` (string).
 *   Lines are grouped by `job`; `runs`, `retries`, `lastStatus`, `lastError`, `firstAt` and
 *   `lastAt` summarize the job's lines in file order (each field's rule is documented on
 *   {@link DigestRow}). `counts` totals those lines by `status`.
 * - A non-blank line that does not parse as JSON, or parses but is not a run object (missing or
 *   non-string `at`/`job`, `status` outside the union, `owner` neither a string nor `null`, or a
 *   non-string `error`), is skipped and counted in `badLines`. It is never thrown: one bad line
 *   never stops the night from rendering.
 * - Blank and whitespace-only lines are skipped and NOT counted (a trailing newline is not a bad
 *   line).
 * - A read error other than a missing file (e.g. `EACCES`) is thrown to the caller.
 */
export declare function readNight(runsDir: string, night: string): DigestNight | null;
