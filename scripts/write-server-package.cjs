const fs = require('node:fs');
const path = require('node:path');

const distServerDir = path.resolve(process.cwd(), 'dist-server');

if (!fs.existsSync(distServerDir)) {
  console.warn(`dist-server directory not found at ${distServerDir}`);
  process.exit(0);
}

const packageJsonPath = path.join(distServerDir, 'package.json');
const packageJson = {
  type: 'module',
};

fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');
console.log(`Wrote ${packageJsonPath}`);
