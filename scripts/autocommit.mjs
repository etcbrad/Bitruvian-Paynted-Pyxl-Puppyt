import chokidar from 'chokidar';
import { execSync } from 'node:child_process';

const WATCH_PATHS = ['.'];
const IGNORE = [
  /(^|[\/\\])\.git/, // .git
  /(^|[\/\\])node_modules/, // node_modules
  /(^|[\/\\])dist/, // dist
];

const DEBOUNCE_MS = 2000;
let timer = null;
let pending = false;

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

function hasChanges() {
  try {
    const out = run('git status --porcelain=v1');
    return out.length > 0;
  } catch {
    return false;
  }
}

function commitNow() {
  if (!pending) return;
  pending = false;

  if (!hasChanges()) return;

  const ts = new Date().toISOString().replace('T', ' ').replace('Z', ' UTC');
  try {
    run('git add -A');
    run(`git commit -m "Auto-commit: ${ts}"`);
    // Best-effort auto-push; ignore failures (offline, auth, no remote)
    try {
      run('git push');
      process.stdout.write(`[autocommit] pushed at ${ts}\n`);
    } catch {
      process.stderr.write('[autocommit] push failed\n');
    }
    process.stdout.write(`[autocommit] committed at ${ts}\n`);
  } catch (err) {
    process.stderr.write('[autocommit] commit failed\n');
  }
}

const watcher = chokidar.watch(WATCH_PATHS, {
  ignored: IGNORE,
  ignoreInitial: true,
  awaitWriteFinish: {
    stabilityThreshold: 300,
    pollInterval: 100,
  },
});

watcher.on('all', () => {
  pending = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(commitNow, DEBOUNCE_MS);
});

process.stdout.write('[autocommit] watching for changes...\n');
