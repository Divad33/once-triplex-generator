#!/usr/bin/env node
// Stages android-config/google-services.json into the Capacitor android
// template archive so that the next `npx cap add android` extracts the
// file into android/app/google-services.json automatically.
//
// Why: Firebase Cloud Messaging + App Check require google-services.json
// at android/app/ before Gradle build, otherwise PushNotifications.register()
// and FirebaseAppCheck.initialize() crash the app at runtime.
//
// Capacitor 7+ ships its android scaffold as a tar.gz inside
// @capacitor/cli/assets. The build pipeline can't write directly to
// android/app/ before `cap add android` runs (the directory doesn't exist
// yet) and the CLI refuses to add the platform if android/ already exists.
// Injecting the file into the tarball is the cleanest hook that works
// without modifying the GitHub Actions workflow file.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const REPO_ROOT = process.cwd();
const SRC = path.join(REPO_ROOT, 'android-config/google-services.json');
const TAR_GZ = path.join(
  REPO_ROOT,
  'node_modules/@capacitor/cli/assets/android-template.tar.gz',
);

function log(msg) {
  console.log(`[stage-firebase-config] ${msg}`);
}

if (!fs.existsSync(SRC)) {
  log(`source not found, skipping: ${path.relative(REPO_ROOT, SRC)}`);
  process.exit(0);
}

if (!fs.existsSync(TAR_GZ)) {
  log(`capacitor android template not found, skipping: ${path.relative(REPO_ROOT, TAR_GZ)}`);
  process.exit(0);
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cap-stage-'));
try {
  const tarPath = path.join(workDir, 'android-template.tar');

  // 1. Decompress the bundled tar.gz into a plain tar.
  const gz = fs.readFileSync(TAR_GZ);
  fs.writeFileSync(tarPath, zlib.gunzipSync(gz));

  // 2. Stage google-services.json under app/ so its path inside the tar
  //    matches the template layout (`app/google-services.json`).
  const stagedDir = path.join(workDir, 'app');
  fs.mkdirSync(stagedDir, { recursive: true });
  fs.copyFileSync(SRC, path.join(stagedDir, 'google-services.json'));

  // 3. Append the staged file to the tar archive. `tar --append` keeps
  //    existing entries intact and adds the new one; if a previous run
  //    already added it, the new entry simply shadows the old one when
  //    extracted (last-write-wins for tar extraction).
  execFileSync('tar', ['-rf', tarPath, 'app/google-services.json'], {
    cwd: workDir,
    stdio: 'inherit',
  });

  // 4. Re-compress and replace the original archive.
  const updatedTar = fs.readFileSync(tarPath);
  const updatedGz = zlib.gzipSync(updatedTar);
  fs.writeFileSync(TAR_GZ, updatedGz);

  let pkg = 'unknown';
  try {
    const config = JSON.parse(fs.readFileSync(SRC, 'utf8'));
    pkg = config?.client?.[0]?.client_info?.android_client_info?.package_name ?? 'unknown';
  } catch {
    /* ignore parse errors */
  }
  log(`staged google-services.json (package_name=${pkg}) into capacitor android template`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
}
