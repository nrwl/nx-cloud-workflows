import { execSync } from 'child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL as string;
const commitSha = process.env.NX_COMMIT_SHA as string;
const nxBranch = process.env.NX_BRANCH as string; // This can be a PR number or a branch name
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;
const fetchTags = process.env.GIT_FETCH_TAGS === 'true';
const maxRetries = 3;

async function main() {
  if (process.platform != 'win32') {
    runWithRetries(
      `git config --global --add safe.directory $PWD`,
      'set safe directory',
      1,
    );
  }
  runWithRetries('git init .', 'git init', 1);
  runWithRetries(`git remote add origin ${repoUrl}`, 'git remote add', 1);
  runWithRetries(
    `echo "GIT_REPOSITORY_URL=''" >> $NX_CLOUD_ENV`,
    'persist git url',
    1,
  );

  let fetchCommand: string;
  if (commitSha.startsWith('origin/')) {
    fetchCommand = `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=1 origin ${nxBranch}`;
  } else {
    if (depth === '0') {
      fetchCommand =
        'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*"';
    } else {
      const tagsArg = fetchTags ? ' --tags' : '--no-tags';
      fetchCommand = `git fetch ${tagsArg} --prune --progress --no-recurse-submodules --depth=${depth} origin ${commitSha}`;
    }
  }

  await runWithRetries(fetchCommand, 'git fetch', maxRetries);

  const checkoutCommand = `git checkout --progress --force -B ${nxBranch} ${commitSha}`;
  await runWithRetries(checkoutCommand, 'git checkout', maxRetries);
}

async function runWithRetries(
  command: string,
  label: string,
  maxRetriesLocal: number,
) {
  let attempt = 0;
  while (attempt < maxRetriesLocal) {
    try {
      console.log(`\n--- ${command} attempt ${attempt + 1} ---`);
      execSync(command, { stdio: 'inherit' });
      return;
    } catch (e) {
      attempt++;

      if (attempt >= maxRetriesLocal) {
        throw e;
      }
      const jitter = Math.floor(Math.random() * 1_000);
      const delayMs = (attempt === 1 ? 10_000 : 60_000) + jitter;

      const stderr = (e as any)?.stderr?.toString?.() || '';
      const stdout = (e as any)?.stdout?.toString?.() || '';
      if (stderr) {
        console.error(stderr.trim());
      }
      if (stdout) {
        console.log(stdout.trim());
      }
      console.log(
        `\n--- ${label} attempt ${attempt} failed; retrying in ${
          delayMs / 1000
        }s ---`,
      );

      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

main()
  .then(() => {})
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
