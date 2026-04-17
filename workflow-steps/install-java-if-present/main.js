const { platform, arch, tmpdir } = require('os');
const { execSync } = require('child_process');
const { existsSync, writeFileSync } = require('fs');

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

const javaVersion = process.env.NX_CLOUD_INPUT_java_version || '21';
console.log(`JVM project detected. Installing Java ${javaVersion} via mise...`);

// Write a mise.toml so the inlined mise install picks up the tool.
writeFileSync('mise.toml', `[tools]\njava = "${javaVersion}"\n`, {
  encoding: 'utf-8',
});

// --- inlined install-mise logic ---

const miseGhVersion =
  process.env['NX_CLOUD_INPUT_mise-version'] || 'v2025.12.2';
const installArgs = process.env['NX_CLOUD_INPUT_install-args'] || '';

const MISE_INSTALL_DIR = '$HOME/.local/bin';
const MISE_SHIM_DIR = '$HOME/.local/share/mise/shims';
const TMP_DIR = tmpdir();

process.env.MISE_TRUSTED_CONFIG_PATHS = process.cwd();
process.env.MISE_YES = '1';

function retryWithBackoff(
  fn,
  maxRetries = 3,
  retryDelayMs = 1000,
  fnName = 'operation',
) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      fn();
      if (attempt > 1)
        console.log(`> ${fnName} succeeded on attempt ${attempt}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`> ${fnName} failed on attempt ${attempt}/${maxRetries}`);
      console.error(`  Error: ${error.message}`);
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt - 1);
        console.log(`> Retrying in ${delay}ms...`);
        execSync(`sleep ${delay / 1000}`, { stdio: 'inherit' });
      }
    }
  }
  throw lastError;
}

if (!miseGhVersion.startsWith('v')) {
  console.error(`Invalid mise_version: ${miseGhVersion}`);
  process.exit(1);
}

function getVersionUrl(_platform, _arch) {
  let resolvedPlatform;
  let resolvedArch;
  if (_platform === 'darwin') resolvedPlatform = 'macos';
  else if (_platform === 'win32') resolvedPlatform = 'windows';
  else resolvedPlatform = 'linux';

  if (_arch === 'x64' || _arch === 'arm64') resolvedArch = _arch;
  else {
    console.error('Unsupported architecture: ', _arch);
    process.exit(1);
  }

  const version = `${miseGhVersion}-${resolvedPlatform}-${resolvedArch}`;
  const url = `https://github.com/jdx/mise/releases/download/${miseGhVersion}/mise-${version}.tar.gz`;
  console.log(`> Resolved mise version to download as: ${version}`);
  return url;
}

function downloadMise(downloadUrl) {
  console.log(`> Downloading mise from ${downloadUrl}`);
  execSync(`mkdir -p ${MISE_INSTALL_DIR}`, { stdio: 'inherit' });
  retryWithBackoff(
    () => {
      execSync(`curl -fsSL ${downloadUrl} | tar -xzf - -C ${TMP_DIR}`, {
        stdio: 'inherit',
      });
    },
    3,
    1000,
    'mise download',
  );
  execSync(`mv ${TMP_DIR}/mise/bin/mise ${MISE_INSTALL_DIR}/mise`, {
    stdio: 'inherit',
  });
}

function setupMise(installCommandArgs) {
  execSync(`chmod +x ${MISE_INSTALL_DIR}/mise`, { stdio: 'inherit' });
  execSync(`mkdir -p ${MISE_SHIM_DIR}`, { stdio: 'inherit' });

  const newPATH = `${MISE_INSTALL_DIR}:${MISE_SHIM_DIR}:$PATH`;
  const setPath = `export PATH="${newPATH}" && echo PATH="${newPATH}" >> $NX_CLOUD_ENV`;
  const setMiseEnvVars = `echo "MISE_YES=1" >> $NX_CLOUD_ENV && echo "MISE_TRUSTED_CONFIG_PATHS=$HOME/workspace" >> $NX_CLOUD_ENV`;
  const whichMise = `echo "mise is located at $(which mise)"`;
  const miseVersion = `echo "mise version is: $(mise version)"`;
  const installMiseTools = `mise install ${installCommandArgs}`;

  execSync(
    [setPath, setMiseEnvVars, whichMise, miseVersion, installMiseTools].join(
      ' && ',
    ),
    { stdio: 'inherit' },
  );
}

try {
  const dlUrl = getVersionUrl(platform(), arch());
  downloadMise(dlUrl);
  setupMise(installArgs);
} catch (error) {
  console.error('> Failed to install Java via mise:');
  console.error(error);
  process.exit(1);
}
