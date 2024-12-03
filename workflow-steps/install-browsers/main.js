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
      const output = execSync('npx playwright install', {
        stdio: 'inherit',
      }).toString();

      if (output.includes('missing dependencies')) {
        console.log(
          'Playwright detected missing dependencies. Attempting to install...',
        );
        try {
          // playwright has detected out of sync dependencies on the host machine, we we'll try to manually install them to prevent hard to debug failures
          const installDryRun = execSync(
            'npx playwright install --with-deps --dry-run',
            { stdio: 'pipe' },
          ).toString();

          const [installCommand] = installDryRun.match(
            /apt-get install .+(?=")/gi,
          );
          if (installCommand) {
            console.log(
              `Installing Playwright dependencies:\n${installCommand}`,
            );
            execSync(installCommand, { stdio: 'inherit' });
          }
        } catch (installError) {
          console.error(
            'There was an issue installing dependencies for Playwright.',
          );
          console.error(installError);
          console.log(
            'You can create a custom launch template and add a step to manually install the missing Playwright dependencies in order to get around this error.',
          );
          console.log(
            'See docs here: https://nx.dev/ci/reference/launch-templates',
          );
        }
      }
    }

    const hasCypress =
      (json.dependencies || {}).hasOwnProperty('cypress') ||
      (json.devDependencies || {}).hasOwnProperty('cypress');
    if (hasCypress) {
      console.log('Installing browsers required by Cypress');
      execSync('npx cypress install', { stdio: 'inherit' });
    }
  } catch (e) {
    console.error(e);
  }
}
