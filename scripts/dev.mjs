// Runs the API and the web client together without pulling in a process-manager dependency.
import { spawn } from 'node:child_process';

const targets = [
  { name: 'api', color: '\x1b[36m', args: ['run', 'dev', '--workspace', 'server'] },
  { name: 'web', color: '\x1b[35m', args: ['run', 'dev', '--workspace', 'web'] },
];

const children = [];
let shuttingDown = false;

for (const target of targets) {
  const child = spawn('npm', target.args, { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);

  const prefix = `${target.color}[${target.name}]\x1b[0m `;
  const relay = (stream, out) => {
    let buffered = '';
    stream.on('data', (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);

  child.on('exit', (code) => {
    if (shuttingDown) return;
    process.stdout.write(`${prefix}exited with code ${code}\n`);
    shutdown(code ?? 1);
  });
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
