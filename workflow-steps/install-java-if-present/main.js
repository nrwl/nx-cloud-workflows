const { existsSync } = require('fs');

const jvmMarkers = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'pom.xml',
];

if (!jvmMarkers.some((f) => existsSync(f))) {
  console.log(
    'No JVM project detected (no build.gradle, build.gradle.kts, settings.gradle*, or pom.xml). Skipping Java install.',
  );
  return;
}

if (
  existsSync('mise.toml') ||
  existsSync('.mise.toml') ||
  existsSync('.tool-versions')
) {
  console.log(
    'Mise config detected — Java is expected to be managed via mise. Skipping auto java=<version> install to avoid overwriting the user config.',
  );
  return;
}

const version = process.env.NX_CLOUD_INPUT_java_version || '21';
console.log(`JVM project detected. Installing Java ${version} via mise...`);
process.env.NX_CLOUD_INPUT_tools = `java=${version}`;
require('../install-mise/main.js');
