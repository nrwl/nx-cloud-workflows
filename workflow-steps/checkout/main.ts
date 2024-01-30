import { execSync } from 'child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL;
const commitSha = process.env.NX_COMMIT_SHA;
const nxBranch = process.env.NX_BRANCH; // This can be a PR number or a branch name
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;
const fetchTags = process.env.GIT_FETCH_TAGS === 'true';

// TODO: infer this in cases where the NX_BRANCH is a branch name despite being a PR (certain CI providers, not GitHub)
const isPR = !isNaN(parseInt(nxBranch!));

if (process.platform != 'win32') {
  execSync(`git config --global --add safe.directory /home/workflows/workspace`);
}
execSync('git init .');
execSync(`git remote add origin ${repoUrl}`);

if (depth === '0') {
  // Fetch all branches and tags if depth is 0
  execSync(
    'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*"',
  );
  if (isPR) {
    // Fetch PR specific references for GitHub
    execSync(
      `git fetch origin pull/${nxBranch}/head:refs/remotes/origin/pr/${nxBranch}`,
    );
  }
  // Checkout using the appropriate reference
  const checkoutRef = isPR ? 'refs/remotes/origin/pr/' + nxBranch : commitSha;
  execSync(`git checkout --progress --force ${checkoutRef}`);
} else {
  // Fetch with specified depth
  const fetchRef = isPR ? `pull/${nxBranch}/head` : `${nxBranch}`;
  const tagsArg = fetchTags ? ' --tags' : '--no-tags';
  execSync(
    `git fetch ${tagsArg} --prune --progress --no-recurse-submodules --depth=${depth} origin ${fetchRef}`,
  );
  // Checkout the branch or PR
  const checkoutRef = isPR ? 'FETCH_HEAD' : `origin/${nxBranch}`;
  execSync(`git checkout --progress --force -B ${nxBranch} ${checkoutRef}`);
}
