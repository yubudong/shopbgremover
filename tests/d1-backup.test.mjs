import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const projectRoot = resolve(import.meta.dirname, '..');
const backupScript = join(projectRoot, 'scripts', 'backup_d1.sh');
const migrationScript = join(projectRoot, 'scripts', 'migrate_d1_remote.sh');
const schemaFile = join(projectRoot, 'worker', 'schema.sql');
const sqliteBin = execFileSync('which', ['sqlite3'], { encoding: 'utf8' }).trim();

async function createFixture(t, { validSql = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'shopbgremover-backup-test-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const exportSql = join(root, 'export.sql');
  await writeFile(exportSql, validSql ? await readFile(schemaFile, 'utf8') : 'not valid sql;', {
    mode: 0o600,
  });

  const logFile = join(root, 'wrangler.log');
  const fakeWrangler = join(root, 'fake-wrangler.sh');
  await writeFile(fakeWrangler, `#!/usr/bin/env bash
set -euo pipefail

if [[ "\${1:-}" == "--version" ]]; then
  echo "4.113.0"
  exit 0
fi

printf '%s\\n' "$*" >> "\${FAKE_WRANGLER_LOG}"

if [[ "\${1:-} \${2:-}" == "d1 export" ]]; then
  output=""
  while [[ "$#" -gt 0 ]]; do
    if [[ "$1" == "--output" ]]; then
      output="$2"
      break
    fi
    shift
  done
  cp "\${FAKE_EXPORT_SQL}" "\${output}"
  exit 0
fi

if [[ "\${1:-} \${2:-} \${3:-}" == "d1 time-travel info" ]]; then
  echo "The current bookmark is 'test-bookmark-0001'"
  exit 0
fi

if [[ "\${1:-} \${2:-} \${3:-}" == "d1 migrations list" ]]; then
  echo "No migrations to apply."
  exit 0
fi

if [[ "\${1:-} \${2:-} \${3:-}" == "d1 migrations apply" ]]; then
  echo "Migrations applied."
  exit 0
fi

echo "Unexpected Wrangler command: $*" >&2
exit 1
`, { mode: 0o700 });
  await chmod(fakeWrangler, 0o700);

  return {
    root,
    backupDir: join(root, 'backups'),
    env: {
      ...process.env,
      FAKE_EXPORT_SQL: exportSql,
      FAKE_WRANGLER_LOG: logFile,
      SHOPBGREMOVER_BACKUP_DIR: join(root, 'backups'),
      SQLITE_BIN: sqliteBin,
      WRANGLER_BIN: fakeWrangler,
    },
    logFile,
  };
}

function run(script, env) {
  return spawnSync('bash', [script], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
  });
}

test('backup script exports, restores, hashes, and records metadata', async (t) => {
  const fixture = await createFixture(t);
  const result = run(backupScript, fixture.env);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^BACKUP_FILE=/m);
  assert.match(result.stdout, /^TIME_TRAVEL_BOOKMARK=test-bookmark-0001$/m);
  assert.match(result.stdout, /^INTEGRITY_CHECK=ok$/m);

  const files = await readdir(fixture.backupDir);
  const sqlFile = files.find((file) => file.endsWith('.sql'));
  const metadataFile = files.find((file) => file.endsWith('.metadata.txt'));
  assert.ok(sqlFile);
  assert.ok(metadataFile);

  const sqlPath = join(fixture.backupDir, sqlFile);
  assert.equal((await stat(fixture.backupDir)).mode & 0o777, 0o700);
  assert.equal((await stat(sqlPath)).mode & 0o777, 0o600);

  const metadata = await readFile(join(fixture.backupDir, metadataFile), 'utf8');
  assert.match(metadata, /^integrity_check=ok$/m);
  assert.match(metadata, /^table_count=15$/m);
  assert.match(metadata, /^user_count=0$/m);
  assert.match(metadata, /^order_count=0$/m);
  assert.match(metadata, /^sha256=[0-9a-f]{64}$/m);
});

test('remote migration wrapper completes a verified backup before apply', async (t) => {
  const fixture = await createFixture(t);
  const result = run(migrationScript, fixture.env);

  assert.equal(result.status, 0, result.stderr);
  const log = await readFile(fixture.logFile, 'utf8');
  const commands = log.trim().split('\n');

  const exportIndex = commands.findIndex((line) => line.startsWith('d1 export '));
  const timeTravelIndex = commands.findIndex((line) => line.startsWith('d1 time-travel info '));
  const listIndex = commands.findIndex((line) => line.startsWith('d1 migrations list '));
  const applyIndex = commands.findIndex((line) => line.startsWith('d1 migrations apply '));

  assert.ok(exportIndex >= 0);
  assert.ok(timeTravelIndex > exportIndex);
  assert.ok(listIndex > timeTravelIndex);
  assert.ok(applyIndex > listIndex);
});

test('invalid export aborts before remote migrations are applied', async (t) => {
  const fixture = await createFixture(t, { validSql: false });
  const result = run(migrationScript, fixture.env);

  assert.notEqual(result.status, 0);
  const log = await readFile(fixture.logFile, 'utf8');
  assert.doesNotMatch(log, /d1 migrations apply/);

  const files = await readdir(fixture.backupDir);
  assert.equal(files.some((file) => file.endsWith('.sql')), false);
});
