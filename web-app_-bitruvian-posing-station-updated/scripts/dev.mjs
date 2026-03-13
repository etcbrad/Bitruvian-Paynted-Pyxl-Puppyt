import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const RESTART_DELAY_MS = 750;
const children = new Map();

function runWithRestart(label, cmd, args) {
  function spawnChild() {
    const child = spawn(cmd, args, {
      stdio: 'inherit',
      env: process.env,
    });

    children.set(label, child);

    child.on('exit', (code) => {
      if (code !== 0) {
        process.stderr.write(`[dev] ${label} exited with code ${code}\n`);
      }
      setTimeout(spawnChild, RESTART_DELAY_MS);
    });
  }

  spawnChild();
}

function shutdown() {
  for (const child of children.values()) {
    try {
      child.kill('SIGTERM');
    } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const repoRoot = process.cwd();
const autocommitScript = resolve(repoRoot, 'scripts/autocommit.mjs');
const viteBin = resolve(repoRoot, 'node_modules/vite/bin/vite.js');
const viteArgs = [viteBin, '--host', '0.0.0.0', '--port', '5173'];

runWithRestart('autocommit', process.execPath, [autocommitScript]);
runWithRestart('vite', process.execPath, viteArgs);
