import { execSync } from 'child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL;
const commitSha = process.env.NX_COMMIT_SHA;
const nxBranch = process.env.NX_BRANCH; // This can be a PR number or a branch name
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;
const fetchTags = process.env.GIT_FETCH_TAGS === 'true';

if (process.platform != 'win32') {
  execSync(`git config --global --add safe.directory $PWD`);
}
execSync('git init .');
execSync(`git remote add origin ${repoUrl}`);

if (depth === '0') {
  // Fetch all branches and tags if depth is 0
  execSync(
    'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*"',
  );
} else {
  // Fetch with specified depth
  const tagsArg = fetchTags ? ' --tags' : '--no-tags';
  execSync(
    `git fetch ${tagsArg} --prune --progress --no-recurse-submodules --depth=${depth} origin ${commitSha}`,
  );
}

// Checkout the branch or PR
execSync(`git checkout --progress --force -B ${nxBranch} ${commitSha}`);
