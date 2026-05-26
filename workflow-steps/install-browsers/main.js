//@ts-check
const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(typeof error?.status === 'number' ? error.status : 1);
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
    await runWithRetries(`${getPackageManagerCommand()} playwright install`);
  }

  if (hasCypress) {
    console.log('Installing browsers required by Cypress');
    await runWithRetries(`${getPackageManagerCommand()} cypress install`);
  }
  console.log('Done');
}

/**
 * Run `command` via execSync with stdio inherited, retrying on any failure
 * (non-zero exit, signal, or per-attempt timeout) until either `maxRetries`
 * is hit or a 10-minute total deadline elapses across all attempts.
 *
 * @param {string} command
 */
async function runWithRetries(command) {
  const maxRetries = Number(process.env.NX_CLOUD_INPUT_max_retries) || 3;
  const deadline = Date.now() + 600_000;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(`Timed out running "${command}" after 10 minutes`);
    }

    try {
      execSync(command, {
        stdio: 'inherit',
        timeout: remaining,
        killSignal: 'SIGKILL',
      });
      return;
    } catch (e) {
      retryCount++;

      if (retryCount >= maxRetries || Date.now() >= deadline) {
        throw e;
      }

      const delay = Math.max(
        3_000,
        Math.pow(2, retryCount) * Math.random() * 1_250,
      );
      console.log(
        `Installing browsers failed. Retrying install in ${(
          delay / 1000
        ).toFixed(0)} seconds...`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
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
