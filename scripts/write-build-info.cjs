const fs = require('node:fs');
const path = require('node:path');

let buildVersion = process.env.BUILD_VERSION || process.env.npm_package_version || '0.0.0';

const pkgPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.version && pkg.version !== '0.0.0') {
      buildVersion = pkg.version;
    }
  } catch {}
}

const buildTimestamp = new Date().toISOString();
const buildId = `${buildVersion}-${Date.parse(buildTimestamp)}`;

const outputPath = path.join(process.cwd(), 'src', 'generated', 'buildInfo.ts');
const fileContents = `export const BUILD_ID = ${JSON.stringify(buildId)};
export const BUILD_VERSION = ${JSON.stringify(buildVersion)};
export const BUILD_TIMESTAMP = ${JSON.stringify(buildTimestamp)};
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, fileContents, 'utf8');
console.log(`Wrote ${outputPath} (version=${buildVersion}, id=${buildId})`);

const versionJsonPath = path.join(process.cwd(), 'public', 'version.json');
const versionJsonContent =
  JSON.stringify(
    {
      version: buildVersion,
      deployId: buildId,
      minSupported: process.env.MIN_SUPPORTED_VERSION || buildVersion,
      forceUpdate: true,
    },
    null,
    2
  ) + '\n';
fs.writeFileSync(versionJsonPath, versionJsonContent, 'utf8');
console.log(`Wrote ${versionJsonPath}`);
