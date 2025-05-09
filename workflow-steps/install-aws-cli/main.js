const { execSync } = require('node:child_process');
const AWS_CLI_URL = 'https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip';

// run in the workflows dir instead of /home/workflows/workspace
const cwd = '/home/workflows';

function main() {
  const isAlreadyInstalled = isAwsCliInstalled();
  if (isAlreadyInstalled) {
    console.log('✅  AWS CLI is already installed. Skipping installation');
    process.exit(0);
  } else {
    installAwsCli();

    if (!isAwsCliInstalled()) {
      console.error(
        'AWS CLI was not installed successfully. Please report this issue to support.',
      );
      console.error(
        'You can work around this error by using a custom launch template and manually installing the AWS cli according to the linux guide.\n',
      );
      throw new Error(
        'Installation checks failed. aws-cli could not be found on the system when it was expected to be installed.',
      );
    }
  }

  verifyAwsIdentity();
  console.log('Done');
}

function installAwsCli() {
  console.log('👉  Installing AWS CLI...');
  execSync('sudo apt-get install -yq unzip zip', {
    cwd,
    stdio: 'inherit',
  });
  execSync(`curl ${AWS_CLI_URL} -o awscliv2.zip`, {
    cwd,
    stdio: 'inherit',
  });
  execSync('unzip -q ./awscliv2.zip', {
    cwd,
    stdio: 'inherit',
  });
  execSync('sudo ./aws/install', {
    cwd,
  });
}

function isAwsCliInstalled() {
  console.log('👉  Checking if AWS CLI is installed...');

  try {
    const whichAws = execSync('which aws')?.toString()?.trim();

    if (!whichAws) {
      return false;
    }

    execSync('aws --version', { stdio: 'inherit' });
  } catch {
    return false;
  }

  return true;
}

function verifyAwsIdentity() {
  console.log('👉  Verifying configured AWS identity...');
  const keys = Object.entries(process.env)
    .filter(([key, value]) => key.startsWith('AWS_'))
    .map(([key, value]) => {
      const hasValue = !!value ? value.trim().length > 0 : false;
      console.log(
        `${key}: ${hasValue ? '✅  - value set' : '❌  - value is empty'}`,
      );

      return key;
    });

  if (keys.length === 0) {
    console.warn(
      '❌  No AWS keys found. Please make sure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION and/or AWS_SESSION_TOKEN are set.',
    );
    console.warn(
      'Checking the AWS identity will most likely fail. Running anyways to verify...',
    );
  }

  try {
    execSync('aws sts get-caller-identity', { stdio: 'inherit' });
  } catch {
    console.error(
      '❌  Error verifying AWS identity. Are all the AWS environment variables set?',
    );
    process.exit(1);
  }
}

main();
