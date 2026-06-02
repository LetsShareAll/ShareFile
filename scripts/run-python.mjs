import { spawn, spawnSync } from 'node:child_process';

const [, , scriptPath, ...scriptArgs] = process.argv;

if (!scriptPath) {
  console.error('Usage: node scripts/run-python.mjs <script.py|-m> [...args]');
  process.exit(2);
}

function getCandidates() {
  if (process.env.PYTHON) {
    return [{ command: process.env.PYTHON, args: [] }];
  }

  if (process.platform === 'win32') {
    return [
      { command: 'python', args: [] },
      { command: 'py', args: ['-3'] },
    ];
  }

  return [
    { command: 'python3', args: [] },
    { command: 'python', args: [] },
  ];
}

function canRun(candidate) {
  const result = spawnSync(
    candidate.command,
    [...candidate.args, '--version'],
    {
      shell: process.platform === 'win32',
      stdio: 'ignore',
    },
  );

  return result.status === 0;
}

const candidate = getCandidates().find(canRun);

if (!candidate) {
  const names = getCandidates()
    .map(item => [item.command, ...item.args].join(' '))
    .join(', ');
  console.error(`Python 3 executable not found. Tried: ${names}`);
  process.exit(127);
}

const child = spawn(
  candidate.command,
  [...candidate.args, scriptPath, ...scriptArgs],
  {
    shell: process.platform === 'win32',
    stdio: 'inherit',
  },
);

child.on('error', error => {
  console.error(`Failed to start ${candidate.command}:`, error);
  process.exit(1);
});

child.on('close', code => {
  process.exit(code ?? 1);
});
