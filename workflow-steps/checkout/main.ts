import { execSync } from 'child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL as string;
const commitSha = process.env.NX_COMMIT_SHA as string;
const nxBranch = process.env.NX_BRANCH as string; // This can be a PR number or a branch name
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;
const fetchTags = process.env.GIT_FETCH_TAGS === 'true';
const maxRetries = 3;

async function main() {
  if (process.platform != 'win32') {
    execSync(`git config --global --add safe.directory $PWD`);
  }
  execSync('git init .');
  execSync(`git remote add origin ${repoUrl}`);
  execSync(`echo "GIT_REPOSITORY_URL=''" >> $NX_CLOUD_ENV`);

  let fetchCommand: string;
  if (commitSha.startsWith('origin/')) {
    fetchCommand = `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=1 origin ${nxBranch}`;
  } else {
    if (depth === '0') {
      fetchCommand =
        'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*" "+refs/pull/*/head:refs/remotes/origin/pr/*"';
    } else {
      const tagsArg = fetchTags ? ' --tags' : '--no-tags';
      fetchCommand = `git fetch ${tagsArg} --prune --progress --no-recurse-submodules --depth=${depth} origin ${commitSha}`;
    }
  }

  await runWithRetries(() => execSync(fetchCommand), 'git fetch', maxRetries);

  const checkoutCommand = `git checkout --progress --force -B ${nxBranch} ${commitSha}`;
  await runWithRetries(
    () => execSync(checkoutCommand),
    'git checkout',
    maxRetries,
  );
}

async function runWithRetries(
  fn: () => void,
  label: string,
  maxRetriesLocal: number,
) {
  let attempt = 0;
  while (attempt < maxRetriesLocal) {
    try {
      fn();
      return;
    } catch (e) {
      attempt++;

      if (attempt >= maxRetriesLocal) {
        throw e;
      }

      const delayMs = attempt === 1 ? 10_000 : 60_000;
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
