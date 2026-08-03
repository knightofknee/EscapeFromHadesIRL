#!/usr/bin/env node
// tools/setLatestVersion.js
//
// Flips the update-nudge version after a release is confirmed live in the App
// Store. Sets Config/app.latestVersion, which components/ui/update-modal.tsx
// compares against the running binary's own version (see lib/app-update.ts).
// Use the BINARY version (the one EAS stamps from app.json), not the public
// App Store name; the two are different numbering schemes on purpose.
//
//   node tools/setLatestVersion.js 1.0.18
//
// Run it only once the store actually serves the update (check the listing
// page or a device's App Store), so the nudge never sends users to a page
// with nothing to install.
//
// Auth: uses gcloud Application Default Credentials via the Firestore REST
// API — no firebase-admin dependency. One-time setup if the token call fails:
//   gcloud auth application-default login

const { execFileSync } = require('node:child_process');

const PROJECT_ID = 'escape-from-hades-irl';
const DOC_URL =
  `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
  '/databases/(default)/documents/Config/app';

const version = process.argv[2];
if (!version || !/^\d+(\.\d+)*$/.test(version)) {
  console.error('Usage: node tools/setLatestVersion.js <binary version, e.g. 1.0.18>');
  process.exit(1);
}

let token;
try {
  token = execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
    encoding: 'utf8',
  }).trim();
} catch {
  console.error('Could not get a gcloud token. Run: gcloud auth application-default login');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'x-goog-user-project': PROJECT_ID,
};

async function main() {
  // PATCH with an updateMask touches only latestVersion, preserving the
  // store-link fields on the doc.
  const res = await fetch(`${DOC_URL}?updateMask.fieldPaths=latestVersion`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { latestVersion: { stringValue: version } } }),
  });
  if (!res.ok) {
    console.error(`Write failed (${res.status}):`, await res.text());
    process.exit(1);
  }
  const readBack = await fetch(DOC_URL, { headers });
  console.log('Config/app is now:', JSON.stringify(await readBack.json(), null, 2));
}

main().catch((e) => {
  console.error('Write failed:', e.message);
  process.exit(1);
});
