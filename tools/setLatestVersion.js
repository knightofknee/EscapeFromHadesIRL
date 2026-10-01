#!/usr/bin/env node
// tools/setLatestVersion.js
//
// The two update dials on Config/app, both on the BINARY version scheme (the
// one EAS stamps from app.json):
//
//   WARN   latestVersion  older builds get the snoozable "Update available" card
//   BLOCK  minVersion     older builds get the full-screen "Update required"
//                         screen (components/ui/update-required-gate.tsx)
//
//   node tools/setLatestVersion.js 1.0.22                          warn only
//   node tools/setLatestVersion.js 1.0.22 --min-version 1.0.22     warn + block
//   node tools/setLatestVersion.js --min-version ""                lift the block
//   ... --message "Text for the block screen"                      optional copy
//
// Run the warn flip only once the store actually serves the update. The block
// only reaches builds that contain the gate (the first build made after
// 2026-09-22 and later); older binaries have no gate code. The floor may never
// sit above latestVersion.
//
// Auth: gcloud Application Default Credentials via the Firestore REST API.
//   gcloud auth application-default login

const { execFileSync } = require('node:child_process');

const PROJECT_ID = 'escape-from-hades-irl';
const DOC_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
  '/databases/(default)/documents/Config/app';
const DOTTED = /^\d+(\.\d+)*$/;

const argv = process.argv.slice(2);
function flag(name) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? (argv[i + 1] ?? '') : null;
}
const version = argv.find((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const minVersion = flag('min-version');
const message = flag('message');

function usage(msg) {
  if (msg) console.error(msg);
  console.error('Usage: node tools/setLatestVersion.js [<latest, e.g. 1.0.22>] [--min-version <floor>|""] [--message "..."]');
  process.exit(1);
}
if (!version && minVersion === null && message === null) usage();
if (version && !DOTTED.test(version)) usage(`Not a dotted version: ${version}`);
if (minVersion && !DOTTED.test(minVersion)) usage(`Not a dotted version: ${minVersion}`);

function compare(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

let token;
try {
  token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], { encoding: 'utf8' }).trim();
} catch {
  console.error('Could not get a gcloud token. Run: gcloud auth application-default login');
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': PROJECT_ID };

async function main() {
  const current = await (await fetch(DOC_URL, { headers })).json();
  const str = (f) => current?.fields?.[f]?.stringValue ?? '';
  const latest = version || str('latestVersion');
  const floor = minVersion !== null ? minVersion : str('minVersion');
  if (floor && latest && compare(floor, latest) > 0) {
    usage(`minVersion ${floor} is above latestVersion ${latest}: that would block the current release.`);
  }
  // PATCH with an updateMask touches only the named fields; a masked field left
  // out of the body is deleted, which is how "" clears the floor or message.
  const mask = [];
  const fields = {};
  if (version) { mask.push('latestVersion'); fields.latestVersion = { stringValue: version }; }
  if (minVersion !== null) { mask.push('minVersion'); if (minVersion) fields.minVersion = { stringValue: minVersion }; }
  if (message !== null) { mask.push('message'); if (message) fields.message = { stringValue: message }; }
  const qs = mask.map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const res = await fetch(`${DOC_URL}?${qs}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  if (!res.ok) {
    console.error(`Write failed (${res.status}):`, await res.text());
    process.exit(1);
  }
  const readBack = await (await fetch(DOC_URL, { headers })).json();
  const out = Object.fromEntries(Object.entries(readBack.fields ?? {}).map(([k, v]) => [k, v.stringValue ?? v.booleanValue]));
  console.log('Config/app is now:', JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error('Write failed:', e.message);
  process.exit(1);
});
