import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Mima Proxy-Bootstrapper for Hostinger
// Use this as the "Startup file" in your Hostinger Node.js panel.
// It will launch the actual server using 'tsx' just like 'npm start'.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('═══════════════════════════════════════════');
console.log('🚀 MIMA PROXY-BOOTSTRAPPER');
console.log('═══════════════════════════════════════════');
console.log(`📂 Working Directory: ${process.cwd()}`);
console.log(`📡 Node Version: ${process.version}`);
console.log(`⏰ Time: ${new Date().toISOString()}`);

// For Hostinger: we use npx to ensure the local 'tsx' dependency is used
const child = spawn('npx', ['tsx', 'server.ts'], {
  cwd: __dirname,
  stdio: 'inherit',
  shell: true, // Required for windows/npx
  env: { 
    ...process.env, 
    NODE_ENV: 'production'
  }
});

child.on('error', (err) => {
  console.error('🔥 FAILED TO START TSX PROCESS:', err);
});

child.on('exit', (code) => {
  console.log(`\n🛑 Server process exited with code ${code}`);
  if (code !== 0) {
    console.error('Check your environment variables and dependencies.');
  }
  process.exit(code || 0);
});
