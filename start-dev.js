const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = __dirname;
const pythonDir = path.join(rootDir, 'python-service');
const frontendDir = path.join(rootDir, 'frontend');

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════');
console.log('\x1b[36m%s\x1b[0m', '   Starting PinVault Pro Full-Stack Application        ');
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════');

// Locate Python executable
const pythonCandidates = [
  path.join(pythonDir, 'venv311', 'Scripts', 'python.exe'),
  path.join(pythonDir, 'venv', 'Scripts', 'python.exe'),
  'python.exe',
  'python',
];

const pythonExe = pythonCandidates.find((p) => p.startsWith('python') || fs.existsSync(p)) || 'python';
console.log(`\x1b[32m[Python]\x1b[0m Using Python: ${pythonExe}`);

// 1. Start Python FastAPI microservice on port 8001
const pyProcess = spawn(
  pythonExe,
  ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8001'],
  {
    cwd: pythonDir,
    shell: process.platform === 'win32',
    stdio: 'pipe',
  }
);

pyProcess.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach((l) => console.log(`\x1b[32m[Python]\x1b[0m ${l}`));
});

pyProcess.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach((l) => console.log(`\x1b[32m[Python]\x1b[0m ${l}`));
});

pyProcess.on('exit', (code) => {
  console.log(`\x1b[31m[Python] Process exited with code ${code}\x1b[0m`);
});

// 2. Start Next.js Frontend on port 3000
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const nextProcess = spawn(npmCmd, ['run', 'dev'], {
  cwd: frontendDir,
  shell: true,
  stdio: 'pipe',
});

nextProcess.stdout.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach((l) => console.log(`\x1b[34m[Frontend]\x1b[0m ${l}`));
});

nextProcess.stderr.on('data', (data) => {
  const lines = data.toString().trim().split('\n');
  lines.forEach((l) => console.log(`\x1b[34m[Frontend]\x1b[0m ${l}`));
});

nextProcess.on('exit', (code) => {
  console.log(`\x1b[31m[Frontend] Process exited with code ${code}\x1b[0m`);
});

// Graceful cleanup on CTRL+C
const cleanup = () => {
  console.log('\n\x1b[33mStopping PinVault Pro services...\x1b[0m');
  try {
    if (process.platform === 'win32') {
      if (pyProcess.pid) spawn('taskkill', ['/pid', String(pyProcess.pid), '/f', '/t']);
      if (nextProcess.pid) spawn('taskkill', ['/pid', String(nextProcess.pid), '/f', '/t']);
    } else {
      pyProcess.kill('SIGINT');
      nextProcess.kill('SIGINT');
    }
  } catch (e) {}
  process.exit();
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
