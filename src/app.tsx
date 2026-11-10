import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { readNight } from './digest/reader.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  // GET /api/digest/:night — the digest page's rows as JSON, for agents. Same
  // readNight() result as the page, so the two never disagree (ADR 0001).
  //
  // 200 body, one night:
  //   {
  //     "night": "YYYY-MM-DD",
  //     "rows": [                       // sorted by job, plain string order
  //       {
  //         "job": "lane/sync",
  //         "owner": "rook" | null,     // owner of the last line; null shown as — on the page
  //         "runs": 8,
  //         "retries": 1,
  //         "lastStatus": "ok" | "retry" | "fail",
  //         "lastError": "lock held" | null,
  //         "firstAt": "2026-10-28T23:00:06+01:00",   // offset kept as written
  //         "lastAt": "2026-10-29T05:00:04+01:00"
  //       }
  //     ],
  //     "badLines": 1                   // unparseable lines, counted and skipped
  //   }
  //
  // 404 body when runs/<night>.jsonl does not exist:
  //   { "error": "no night", "night": "YYYY-MM-DD" }
  app.get('/api/digest/:night', (c) => {
    const night = c.req.param('night');
    const digest = readNight(config.runsDir, night);
    if (digest === null) return c.json({ error: 'no night', night }, 404);
    return c.json(digest);
  });

  return app;
}
