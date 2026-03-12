import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

function run(label, cmd, args) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      process.stderr.write(`[dev] ${label} exited with code ${code}\n`);
    }
  });

  return child;
}

const repoRoot = process.cwd();
const autocommitScript = resolve(repoRoot, 'scripts/autocommit.mjs');
const viteBin = resolve(repoRoot, 'node_modules/vite/bin/vite.js');

run('autocommit', process.execPath, [autocommitScript]);
run('vite', process.execPath, [viteBin]);
