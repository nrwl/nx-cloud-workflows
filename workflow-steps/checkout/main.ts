import { execSync } from 'child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL;
const commitSha = process.env.NX_COMMIT_SHA; // Commit SHA for PR or branch
const isPR = true; // New variable to determine if it's a PR
const branch = process.env.NX_BRANCH;
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;

execSync(`git config --global --add safe.directory /home/workflows/workspace`);
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
      `git fetch origin pull/${commitSha}/head:refs/remotes/origin/pr/${commitSha}`,
    );
  }
  // Checkout the commit directly if it's a PR; otherwise, checkout the branch
  execSync(
    `git checkout --progress --force ${
      isPR ? 'refs/remotes/origin/pr/' + commitSha : commitSha
    }`,
  );
} else {
  // Fetch with specified depth for branch
  execSync(
    `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=${depth} origin ${branch}`,
  );
  // Checkout the branch
  execSync(`git checkout --progress --force -B ${branch} origin/${branch}`);
}
