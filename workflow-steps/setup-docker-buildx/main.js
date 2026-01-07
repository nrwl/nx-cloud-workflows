const { execFileSync } = require('child_process');
const { writeFileSync, appendFileSync, existsSync, copyFileSync } = require('fs');
const { homedir } = require('os');

const builderName =
  process.env['NX_CLOUD_INPUT_builder-name'] || 'nx-agents-builder';
const driverOpts =
  process.env['NX_CLOUD_INPUT_driver-opts'] || '';
const buildxVersion =
  process.env['NX_CLOUD_INPUT_buildx-version'];
const buildkitConfig =
  process.env['NX_CLOUD_INPUT_buildkit-config'];

const BUILDKIT_CONFIG_PATH = '/tmp/buildkitd.toml';

/**
 * Install Docker Buildx to the specified version
 * @param version {string}
 **/
function installBuildx(version) {
  console.log(`> Installing Docker Buildx version: ${version}`);

  const arch = process.arch;
  let archSuffix;
  switch (arch) {
    case 'x64':
      archSuffix = 'linux-amd64';
      break;
    case 'arm64':
      archSuffix = 'linux-arm64';
      break;
    case 'arm':
      archSuffix = 'linux-arm-v7';
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }

  console.log(`> Detected architecture: ${arch} (${archSuffix})`);

  // version needs to start with 'v'
  const versionTag = version.startsWith('v') ? version : `v${version}`;
  const downloadUrl = `https://github.com/docker/buildx/releases/download/${versionTag}/buildx-${versionTag}.${archSuffix}`;
  const fileName = `buildx-${versionTag}.${archSuffix}`;
  const homeDir = homedir();
  const pluginDir = `${homeDir}/.docker/cli-plugins`;
  const targetPath = `${pluginDir}/docker-buildx`;

  try {
    console.log(`> Downloading buildx from ${downloadUrl}`);
    execFileSync('wget', ['-q', downloadUrl], { stdio: 'inherit' });

    console.log('> Creating Docker CLI plugins directory');
    execFileSync('mkdir', ['-p', pluginDir], { stdio: 'inherit' });

    console.log('> Moving buildx binary to CLI plugins directory');
    execFileSync('mv', [fileName, targetPath], { stdio: 'inherit' });

    console.log('> Making buildx executable');
    execFileSync('chmod', ['+x', targetPath], { stdio: 'inherit' });

    console.log('> Verifying buildx installation');
    execFileSync('docker', ['buildx', 'version'], { stdio: 'inherit' });

    console.log(`> Successfully installed Docker Buildx ${versionTag} for ${archSuffix}`);
  } catch (error) {
    console.error('> Failed to install Docker Buildx');
    throw error;
  }
}

/**
 * Create buildkit configuration directory and file
 **/

function createBuildkitConfig(customConfig) {
  console.log('> Creating buildkit configuration...');

  try {
    const sourcePath = '/etc/buildkit/buildkitd.toml';

    // preserve any existing config
    if (existsSync(sourcePath)) {
      console.log('> Copying existing buildkit config');
      copyFileSync(sourcePath, BUILDKIT_CONFIG_PATH);
    } else {
      console.log('> No existing buildkit config found, creating new file');
      writeFileSync(BUILDKIT_CONFIG_PATH, '', { encoding: 'utf-8' });
    }

    // custom config from input is appended
    if (customConfig) {
      appendFileSync(BUILDKIT_CONFIG_PATH, '\n' + customConfig, { encoding: 'utf-8' });
    }

    console.log('> Buildkit config created');
  } catch (error) {
    console.error('> Failed to create buildkit config file');
    throw error;
  }
}

/**
 * Create and configure docker buildx builder
 * @param name {string}
 **/
function setupDockerBuilder(name) {
  console.log(`> Creating docker buildx builder: ${name}`);

  // retry because while it is extremely rare, the docker daemon might not be up yet
  let lastError;
  const maxRetries = 10;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const args = [
        'buildx', 'create',
        '--name', name,
        '--driver', 'docker-container',
        '--config', BUILDKIT_CONFIG_PATH,
        '--use',
        '--bootstrap'
      ];

      // driver-opt if provided
      if (driverOpts) {
        driverOpts.split(',').forEach(opt => {
          args.push('--driver-opt', opt.trim());
        });
      }

      execFileSync('docker', args, { stdio: 'inherit' });

      if (attempt > 1) {
        console.log(`> Docker buildx create succeeded on attempt ${attempt}`);
      }
      console.log(`> Successfully created and bootstrapped builder: ${name}`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`> Docker buildx create failed on attempt ${attempt}/${maxRetries}`);
      console.error(`  Error: ${error.message}`);

      if (attempt < maxRetries) {
        console.log(`> Retrying in ${retryDelayMs}ms...`);
        execFileSync('sleep', [String(retryDelayMs / 1000)], { stdio: 'inherit' });
      }
    }
  }

  console.error(`> Docker buildx create failed after ${maxRetries} attempts`);
  console.error('> Docker daemon may not be available');
  throw lastError;
}

/**
 * Set environment variable for future steps
 * @param name {string}
 **/
function setBuildxBuilderEnv(name) {
  console.log(`> Setting BUILDX_BUILDER environment variable to: ${name}`);

  if (!process.env.NX_CLOUD_ENV) {
    console.error('> NX_CLOUD_ENV is not set');
    console.error('> Cannot persist environment variable for future steps');
    process.exit(1);
  }

  try {
    appendFileSync(process.env.NX_CLOUD_ENV, `BUILDX_BUILDER=${name}\n`, {
      encoding: 'utf-8'
    });
    console.log('> BUILDX_BUILDER environment variable set for future steps');
  } catch (error) {
    console.error('> Failed to set BUILDX_BUILDER environment variable');
    throw error;
  }
}

try {
  console.log('> Setting up Docker Buildx...\n');
  if (buildxVersion) {
    installBuildx(buildxVersion);
  }
  createBuildkitConfig(buildkitConfig);
  setupDockerBuilder(builderName);
  setBuildxBuilderEnv(builderName);
  console.log('\n> Docker Buildx setup complete!');
} catch (error) {
  console.error('> Failed to setup Docker Buildx:');
  console.error(error);
  process.exit(1);
}