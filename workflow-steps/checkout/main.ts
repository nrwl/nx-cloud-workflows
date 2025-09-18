import { execSync } from 'child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL;
const commitSha = process.env.NX_COMMIT_SHA;
const nxBranch = process.env.NX_BRANCH; // This can be a PR number or a branch name
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;
const fetchTags = process.env.GIT_FETCH_TAGS === 'true';
const maxRetries = 3;

async function main() {
  if (!repoUrl) {
    throw new Error('GIT_REPOSITORY_URL is required');
  }
  if (!commitSha) {
    throw new Error('NX_COMMIT_SHA is required');
  }
  if (!nxBranch) {
    throw new Error('NX_BRANCH is required');
  }
  if (process.platform != 'win32') {
    execSync(`git config --global --add safe.directory $PWD`, {
      stdio: 'inherit',
    });
  }
  execSync('git init .', { stdio: 'inherit' });
  execSync(`git remote add origin ${repoUrl}`);
  execSync(`echo "GIT_REPOSITORY_URL=''" >> $NX_CLOUD_ENV`);

  // Build the fetch command based on inputs
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

  await runWithRetries(
    () => execSync(fetchCommand, { stdio: 'inherit' }),
    'git fetch',
    maxRetries,
  );

  const checkoutCommand = `git checkout --progress --force -B ${nxBranch} ${commitSha}`;
  await runWithRetries(
    () => execSync(checkoutCommand, { stdio: 'inherit' }),
    'git checkout',
    maxRetries,
  );
}

function isNonRetriableError(e: unknown): boolean {
  const message = stringifyError(e);
  return /Authentication failed|Invalid username|Invalid user|invalid credentials/i.test(
    message,
  );
}

function stringifyError(e: any): string {
  try {
    return [e?.stderr?.toString?.(), e?.stdout?.toString?.(), e?.message]
      .filter(Boolean)
      .join('\n');
  } catch {
    return String(e);
  }
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

      if (isNonRetriableError(e)) {
        throw e;
      }

      if (attempt >= maxRetriesLocal) {
        throw e;
      }

      const delayMs = Math.max(
        3_000,
        Math.pow(2, attempt) * Math.random() * 1_250,
      );
      console.log(
        `${label} failed. Retrying in ${(delayMs / 1000).toFixed(
          0,
        )} seconds...`,
      );
      if (process.env.NX_VERBOSE_LOGGING === 'true') {
        console.warn(stringifyError(e));
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

main();
