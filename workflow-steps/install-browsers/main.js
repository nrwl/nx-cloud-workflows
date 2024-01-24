const { execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');

if (existsSync('package.json')) {
  try {
    const json = JSON.parse(readFileSync('package.json').toString());
    const hasPlaywright =
      (json.dependencies || {}).hasOwnProperty('@playwright/test') ||
      (json.devDependencies || {}).hasOwnProperty('@playwright/test');
    if (hasPlaywright) {
      console.log('Installing browsers required by Playwright');
      execSync('npx playwright install', { stdio: 'inherit' });
    }
  } catch (e) {
    console.error(e);
  }
}
