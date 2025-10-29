const { platform, arch, tmpdir } = require('os');
const { execSync } = require('child_process');
const { writeFileSync, existsSync } = require('fs');

const runInstall = process.env.NX_CLOUD_INPUT_auto_install
  ? process.env.NX_CLOUD_INPUT_auto_install === 'true'
  : true;
const miseGhVersion = process.env.NX_CLOUD_INPUT_mise_version || 'v2025.10.19';
const installArgs = process.env.NX_CLOUD_INPUT_install_args || '';
const inlineToolDef = process.env.NX_CLOUD_INPUT_tools || '';

const MISE_INSTALL_DIR = '$HOME/.local/bin';
const MISE_SHIM_DIR = '$HOME/.local/share/mise/shims';
const TMP_DIR = tmpdir();

process.env.MISE_TRUSTED_CONFIG_PATHS = process.cwd();
process.env.MISE_YES = '1';

/**
 * Retry a function with exponential backoff
 * @param fn {() => void} - Function to retry
 * @param maxRetries {number} - Maximum number of retry attempts
 * @param retryDelayMs {number} - Initial delay between retries in milliseconds
 * @param fnName {string} - Name of the function for logging
 **/
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
      if (attempt > 1) {
        console.log(`> ${fnName} succeeded on attempt ${attempt}`);
      }
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

  console.error(`> ${fnName} failed after ${maxRetries} attempts`);
  throw lastError;
}

if (!miseGhVersion.startsWith('v')) {
  console.error(`Invalid mise_version: ${miseGhVersion}`);
  console.error(
    `mise_version must start with 'v', e.g., 'v2025.10.19'. Got ${miseGhVersion}`,
  );
  console.error(
    'View available versions at https://github.com/jdx/mise/releases',
  );
  process.exit(1);
}
const osPlatform = platform();
const osArch = arch();

/**
 * @param _platform {string}
 * @param _arch {string}
 **/
function getVersionUrl(_platform, _arch) {
  /**
   * @type {'windows' | 'macos' | 'linux' | undefined}
   **/
  let resolvedPlatform;

  /**
   * @type {'x64' | 'arm64' | undefined}
   **/
  let resolvedArch;

  if (_platform === 'darwin') {
    resolvedPlatform = 'macos';
  } else if (_platform === 'win32') {
    resolvedPlatform = 'windows';
  } else {
    resolvedPlatform = 'linux';
  }

  if (_arch === 'x64' || _arch === 'arm64') {
    resolvedArch = _arch;
  } else {
    console.error('Unsupported architecture: ', _arch);
    console.error(
      'Only x64 and arm64 are supported. Please reach out to support if you see this error. cloud-support@nrwl.io',
    );
    process.exit(1);
  }

  const version = `${miseGhVersion}-${resolvedPlatform}-${resolvedArch}`;
  const url = `https://github.com/jdx/mise/releases/download/${miseGhVersion}/mise-${version}.tar.gz`;
  console.log(`> Resolved version mise version to download as: ${version}`);

  return url;
}

/**
 * @param downloadUrl {string}
 **/
function downloadMise(downloadUrl) {
  console.log(`> Downloading mise from ${downloadUrl}`);
  execSync(`mkdir -p ${MISE_INSTALL_DIR}`, {
    stdio: 'inherit',
  });

  // Retry only the download operation which is most likely to fail due to network issues
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

  console.log(`> Download successful! Moving binary to: ${MISE_INSTALL_DIR}`);
  execSync(`mv ${TMP_DIR}/mise/bin/mise ${MISE_INSTALL_DIR}/mise`, {
    stdio: 'inherit',
  });
}

/**
 * @param autoInstall {boolean}
 * @param installCommandArgs {string}
 **/
function setupMise(autoInstall = true, installCommandArgs = '') {
  console.log('> Setting up mise...\n\n');
  execSync(`chmod +x ${MISE_INSTALL_DIR}/mise`, {
    stdio: 'inherit',
  });
  execSync(`mkdir -p ${MISE_SHIM_DIR}`, {
    stdio: 'inherit',
  });

  const newPATH = `${MISE_INSTALL_DIR}:${MISE_SHIM_DIR}:$PATH`;
  // export for this shell but also persist to NX_CLOUD_ENV for future steps
  const setPath = `export PATH="${newPATH}" && echo PATH="${newPATH}" >> $NX_CLOUD_ENV`;
  const setMiseEnvVars = `echo "MISE_YES=1" >> $NX_CLOUD_ENV && echo "MISE_TRUSTED_CONFIG_PATHS=$HOME/workspace" >> $NX_CLOUD_ENV`;
  const whichMise = `echo "mise is located at $(which mise)"`;
  const miseVersion = `echo "mise version is: $(mise version)"`;
  const installMiseTools = autoInstall
    ? `mise install ${installCommandArgs}`
    : `echo "Skipping auto install. You will need to manuall run mise install"`;

  execSync(
    [setPath, setMiseEnvVars, whichMise, miseVersion, installMiseTools].join(
      ' && ',
    ),
    {
      stdio: 'inherit',
    },
  );

  console.log('\n> Finished setting up mise!');
}

/**
 * @param inlineTools {string}
 **/
function setToolVersions(inlineTools) {
  if (!inlineTools?.trim()) {
    return;
  }

  console.log('> Setting up mise.toml from tools input...');

  if (existsSync('mise.toml')) {
    console.warn(
      '\n⚠️ Existing mise.toml file found! This file will be overritten by the provided tools input.',
    );
    console.warn(
      'If you do not want this file to be overridden, please remove the tools input from the workflow step.\n',
    );
  }

  const toolEntries = inlineTools.split(/\r?\n/).reduce((acc, cur) => {
    const parts = cur
      .trim()
      .split(/[\s|@|=]/)
      .filter((m) => m.trim());
    if (parts.length !== 2) {
      return acc;
    }

    const [tool, version] = parts;

    // if the quotes are already on the value,
    // then don't apply them, otherwise quote the version
    acc.push(
      `${tool.trim()} = ${
        version.trim().startsWith('"') ? version.trim() : `"${version.trim()}"`
      }`,
    );

    return acc;
  }, []);

  console.log(
    `> Parsed ${toolEntries.length} tool definitions from tools input`,
  );
  const toml = `
[tools]
${toolEntries.join('\n')}
`;
  console.log('> Writing tool definitions to mise.toml');
  console.log(toml);
  writeFileSync('mise.toml', toml, { encoding: 'utf-8' });
}

try {
  const dlUrl = getVersionUrl(osPlatform, osArch);
  downloadMise(dlUrl);
  setToolVersions(inlineToolDef);
  setupMise(runInstall, installArgs);
} catch (error) {
  console.error('> Failed to install mise: ');
  console.error(error);
}
