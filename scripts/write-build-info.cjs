const fs = require("node:fs");
const path = require("node:path");

const buildTimestamp = new Date().toISOString();
const buildVersion = process.env.npm_package_version || "0.0.0";
const buildId = `${buildVersion}-${Date.parse(buildTimestamp)}`;

const outputPath = path.join(process.cwd(), "src", "generated", "buildInfo.ts");
const fileContents = `export const BUILD_ID = ${JSON.stringify(buildId)};
export const BUILD_VERSION = ${JSON.stringify(buildVersion)};
export const BUILD_TIMESTAMP = ${JSON.stringify(buildTimestamp)};
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, fileContents, "utf8");
console.log(`Wrote ${outputPath}`);
