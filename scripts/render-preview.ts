import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const night = '2026-10-28';
const out = 'var/preview/index.html';

const app = createApp(loadConfig());
const res = await app.request(`/digest/${night}`);

if (res.status !== 200) {
  console.error(`preview: GET /digest/${night} returned ${res.status}, expected 200`);
  process.exit(1);
}

const html = await res.text();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);

console.log(`preview: wrote ${out} (${Buffer.byteLength(html)} bytes)`);
