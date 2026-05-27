//@ts-check
const { execSync, exec } = require('child_process');
const { existsSync, readFileSync } = require('fs');

const PER_ATTEMPT_TIMEOUT_MS =
  Number(process.env.NX_CLOUD_INPUT_timeout_ms) || 5 * 60 * 1000;
const KILL_GRACE_MS = 5_000;

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

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
      const output = await runCmdAsync(
        `${getPackageManagerCommand()} playwright install`,
      );

      // we can special handle missing deps for failed install
      if (output.code !== 0 && output.stderr.includes('apt-get install')) {
        console.log(
          '\nDetected missing Playwright dependencies. Attempting manual install...',
        );
        // playwright has detected out of sync dependencies on the host machine, we we'll try to manually install them to prevent hard to debug failures
        const [installCommand] =
          output.stderr.match(/apt-get install (\b\w+\b )+/gi) || [];
        if (installCommand) {
          const depsInstalled = installDeps(`sudo ${installCommand.trim()} -y`);
          if (!depsInstalled) {
            console.error(
              'Failed to install system dependencies for Playwright.',
            );
            process.exit(1);
          }
          console.log('Re-attempting to install browsers...');
          const reattempt = await runCmdAsync(`${getPackageManagerCommand()}  playwright install`);
          if (reattempt.code !== 0) {
            console.error(
              'Failed to install Playwright browsers after installing system dependencies.',
            );
            printFailureContext(reattempt);
            process.exit(reattempt.code);
          }
          console.log('Successfully installed Playwright browsers.');
        } else {
          console.error('Unable to handle failure automatically.');
          printFailureContext(output);
          process.exit(output.code);
        }
      } else if (output.code !== 0) {
        console.error(
          'There was an issue installing Playwright browsers. See above logs.',
        );
        printFailureContext(output);
        process.exit(output.code);
      }
    } catch (e) {
      console.error(e);
      console.error('There is an issue installing Playwright dependencies');
      process.exit(1);
    }
  }

  if (hasCypress) {
    console.log('Installing browsers required by Cypress');
    execSync(`${getPackageManagerCommand()} cypress install`, {
      stdio: 'inherit',
    });
  }
  console.log('Done');
}

/**
 * @param {string} cmd
 * @returns {Promise<{ stdout: string; stderr: string; code: number; killedByTimeout: boolean; }>}
 */
async function runCmdAsync(cmd) {
  return new Promise((res, reject) => {
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    let graceTimer = null;
    const proc = exec(cmd);

    const timeoutTimer = setTimeout(() => {
      killedByTimeout = true;
      const seconds = Math.round(PER_ATTEMPT_TIMEOUT_MS / 1000);
      process.stderr.write(
        `\nInstall Browsers: \`${cmd}\` produced no completion for ${seconds}s. ` +
          `Sending SIGTERM to capture any pending output, then SIGKILL in ${KILL_GRACE_MS / 1000}s.\n`,
      );
      proc.kill('SIGTERM');
      graceTimer = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          proc.kill('SIGKILL');
        }
      }, KILL_GRACE_MS);
      graceTimer.unref();
    }, PER_ATTEMPT_TIMEOUT_MS);
    timeoutTimer.unref();

    proc?.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });

    proc?.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    proc.on('error', (error) => {
      clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      reject(error);
    });

    proc.on('close', (code, signal) => {
      clearTimeout(timeoutTimer);
      if (graceTimer) clearTimeout(graceTimer);
      const resolvedCode =
        code !== null
          ? code
          : signal === 'SIGKILL'
            ? 137
            : signal === 'SIGTERM'
              ? 143
              : 1;
      res({ stdout, stderr, code: resolvedCode, killedByTimeout });
    });
  });
}

/**
 * @param {{ stdout: string; stderr: string; killedByTimeout: boolean; }} output
 */
function printFailureContext(output) {
  if (output.killedByTimeout) {
    const seconds = Math.round(PER_ATTEMPT_TIMEOUT_MS / 1000);
    console.error(
      `\nThe command was terminated after ${seconds}s with no completion. This often indicates a stalled download or extraction; if an Install Node step ran earlier in the workflow, that's the most likely interaction.`,
    );
  }
  const lastStdout = output.stdout.split('\n').filter(Boolean).slice(-5).join('\n');
  const lastStderr = output.stderr.split('\n').filter(Boolean).slice(-5).join('\n');
  if (lastStdout) {
    console.error(`\nLast stdout lines:\n${lastStdout}`);
  }
  if (lastStderr) {
    console.error(`\nLast stderr lines:\n${lastStderr}`);
  }
}

function getPackageManagerCommand() {
  if (existsSync('package-lock.json')) {
    return 'npx';
  } else if (existsSync('yarn.lock')) {
    return 'yarn';
  } else if (existsSync('pnpm-lock.yaml') || existsSync('pnpm-lock.yml')) {
    return 'pnpm exec';
  }
}

/**
 * @param {string} installCommand
 * @returns {boolean} true if installation succeeded, false otherwise
 */
function installDeps(installCommand) {
  try {
    console.log(`Running "${installCommand}"`);
    execSync(installCommand.trim(), { stdio: 'inherit' });
    return true;
  } catch (installError) {
    console.error('There was an issue installing dependencies for Playwright.');
    console.log(
      'You can create a custom launch template and add a step to manually install the missing Playwright dependencies in order to get around this error.',
    );
    console.log('See docs here: https://nx.dev/ci/reference/launch-templates');
    return false;
  }
}
