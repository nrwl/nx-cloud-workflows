//@ts-check
const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

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
    execSync(`${getPackageManagerCommand()} playwright install`, {
      stdio: 'inherit',
    });
  }

  if (hasCypress) {
    console.log('Installing browsers required by Cypress');
    execSync(`${getPackageManagerCommand()} cypress install`, {
      stdio: 'inherit',
    });
  }
  console.log('Done');
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
