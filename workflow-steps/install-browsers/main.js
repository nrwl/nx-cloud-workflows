//@ts-check
const { execSync, exec } = require('child_process');
const { existsSync, readFileSync } = require('fs');

const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 5 * 60 * 1000;
const KILL_GRACE_MS = 5_000;
const DEBUG_NAMESPACES = 'pw:install';

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
    console.log(
      `Installing browsers required by Playwright (idle-timeout=${IDLE_TIMEOUT_MS / 1000}s, absolute-timeout=${ABSOLUTE_TIMEOUT_MS / 1000}s)`,
    );
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
 * @returns {Promise<{ stdout: string; stderr: string; code: number; killedByTimeout: boolean; killReason: string | null; }>}
 */
async function runCmdAsync(cmd) {
  return new Promise((res, reject) => {
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    /** @type {string | null} */
    let killReason = null;
    /** @type {NodeJS.Timeout | null} */
    let graceTimer = null;
    /** @type {NodeJS.Timeout | null} */
    let idleTimer = null;

    const childEnv = { ...process.env };
    childEnv.DEBUG = childEnv.DEBUG
      ? `${childEnv.DEBUG},${DEBUG_NAMESPACES}`
      : DEBUG_NAMESPACES;

    const proc = exec(cmd, { env: childEnv });

    function escalateKill() {
      killedByTimeout = true;
      try {
        proc.kill('SIGTERM');
      } catch (e) {
        // already exited
      }
      process.stderr.write(
        `\nInstall Browsers: sent SIGTERM. SIGKILL in ${KILL_GRACE_MS / 1000}s if still running.\n`,
      );
      graceTimer = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          process.stderr.write(
            `Install Browsers: grace expired, sending SIGKILL.\n`,
          );
          try {
            proc.kill('SIGKILL');
          } catch (e) {
            // already exited
          }
        }
      }, KILL_GRACE_MS);
      graceTimer.unref();
    }

    const absoluteTimer = setTimeout(() => {
      const seconds = Math.round(ABSOLUTE_TIMEOUT_MS / 1000);
      killReason = `absolute timeout (${seconds}s elapsed)`;
      process.stderr.write(
        `\nInstall Browsers: \`${cmd}\` reached absolute timeout of ${seconds}s.\n`,
      );
      escalateKill();
    }, ABSOLUTE_TIMEOUT_MS);
    absoluteTimer.unref();

    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const seconds = Math.round(IDLE_TIMEOUT_MS / 1000);
        killReason = `idle timeout (no output for ${seconds}s)`;
        process.stderr.write(
          `\nInstall Browsers: \`${cmd}\` produced no output for ${seconds}s.\n`,
        );
        escalateKill();
      }, IDLE_TIMEOUT_MS);
      idleTimer.unref();
    }
    resetIdleTimer();

    proc?.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
      resetIdleTimer();
    });

    proc?.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
      resetIdleTimer();
    });

    proc.on('error', (error) => {
      clearTimeout(absoluteTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (graceTimer) clearTimeout(graceTimer);
      reject(error);
    });

    proc.on('close', (code, signal) => {
      clearTimeout(absoluteTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (graceTimer) clearTimeout(graceTimer);
      const resolvedCode =
        code !== null
          ? code
          : signal === 'SIGKILL'
            ? 137
            : signal === 'SIGTERM'
              ? 143
              : 1;
      res({
        stdout,
        stderr,
        code: resolvedCode,
        killedByTimeout,
        killReason,
      });
    });
  });
}

/**
 * @param {{ stdout: string; stderr: string; killedByTimeout: boolean; killReason: string | null; }} output
 */
function printFailureContext(output) {
  if (output.killedByTimeout) {
    console.error(`\nInstall Browsers: terminated by ${output.killReason}.`);
  }
  console.error(`Active node version: ${process.version}`);
  const playwrightVersion = resolvePlaywrightVersion();
  if (playwrightVersion) {
    console.error(`Resolved playwright version: ${playwrightVersion}`);
  }
  const lastStdout = output.stdout.split('\n').filter(Boolean).slice(-10).join('\n');
  const lastStderr = output.stderr.split('\n').filter(Boolean).slice(-10).join('\n');
  if (lastStdout) {
    console.error(`\nLast stdout lines:\n${lastStdout}`);
  }
  if (lastStderr) {
    console.error(`\nLast stderr lines:\n${lastStderr}`);
  }
}

/**
 * @returns {string | null}
 */
function resolvePlaywrightVersion() {
  const candidates = [
    'node_modules/@playwright/test/package.json',
    'node_modules/playwright/package.json',
    'node_modules/playwright-core/package.json',
  ];
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) {
        const v = JSON.parse(readFileSync(candidate, 'utf8'))?.version;
        if (typeof v === 'string' && v) return v;
      }
    } catch (e) {
      // try the next one
    }
  }
  return null;
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
