//@ts-check
const { execSync, exec } = require('child_process');
const { existsSync, readFileSync } = require('fs');

main();

async function main() {
  if (!existsSync('package.json')) {
    console.log(
      'Unable to determine which e2e test runner being used. Missing root level package.json file',
    );
    return;
  }

  const json = JSON.parse(readFileSync('package.json').toString());
  const hasPlaywright =
    (json.dependencies || {}).hasOwnProperty('@playwright/test') ||
    (json.devDependencies || {}).hasOwnProperty('@playwright/test');

  const hasCypress =
    (json.dependencies || {}).hasOwnProperty('cypress') ||
    (json.devDependencies || {}).hasOwnProperty('cypress');

  if (hasPlaywright) {
    console.log('Installing browsers required by Playwright');
    try {
      const output = await runCmdAsync('npx playwright install');

      if (output.stderr.includes('apt-get install')) {
        console.log(
          '\nDetected missing Playwright dependencies. Attempting manual install...',
        );
        // playwright has detected out of sync dependencies on the host machine, we we'll try to manually install them to prevent hard to debug failures
        const [installCommand] =
          output.stderr.match(/apt-get install (\b\w+\b )+/gi) || [];
        if (installCommand) {
          installDeps(`sudo ${installCommand.trim()} -y`);
        } else {
          console.warn('Unable to parse install command');
        }
      }
    } catch (e) {
      console.error(e);
      console.log('There is an issue install playwright dependencies');
    }
  }

  if (hasCypress) {
    console.log('Installing browsers required by Cypress');
    execSync('npx cypress install', { stdio: 'inherit' });
  }
  console.log('Done');
}

/**
 * @param {string} cmd
 * @returns {Promise<{ stdout: string; stderr: string; code: number | null; }>}
 */
async function runCmdAsync(cmd) {
  return new Promise((res) => {
    let stdout = '';
    let stderr = '';
    const proc = exec(cmd);

    proc?.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc?.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      res({ stdout, stderr, code });
    });
  });
}

/**
 * @param {string} installCommand
 */
function installDeps(installCommand) {
  try {
    console.log(`Running "${installCommand}"`);
    execSync(installCommand.trim(), { stdio: 'inherit' });
  } catch (installError) {
    console.error('There was an issue installing dependencies for Playwright.');
    console.log(
      'You can create a custom launch template and add a step to manually install the missing Playwright dependencies in order to get around this error.',
    );
    console.log('See docs here: https://nx.dev/ci/reference/launch-templates');
  }
}
