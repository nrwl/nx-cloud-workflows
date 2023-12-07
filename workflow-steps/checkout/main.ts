import { execSync } from 'node:child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL;
const commitSha = process.env.NX_COMMIT_SHA;
const commitRef = process.env.NX_COMMIT_REF;
const branch = process.env.NX_BRANCH;
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;

execSync(`git config --global --add safe.directory /home/workflows/workspace`);
execSync('git init .');
execSync(`git remote add origin ${repoUrl}`);

if (depth === '0') {
  // Fetch all history and tags if depth is 0
  execSync(
    `git fetch --prune --progress --no-recurse-submodules --tags origin`,
  );
  execSync(`git checkout --progress --force -B ${branch} ${commitSha}`);
} else {
  // Fetch with specified depth
  execSync(
    `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=${depth} origin +${commitSha}:${commitRef}`,
  );
  execSync(`git checkout --progress --force -B ${branch} ${commitRef}`);
}
