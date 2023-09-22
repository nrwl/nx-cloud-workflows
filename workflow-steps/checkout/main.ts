import { execSync } from 'child_process';

const repoUrl = process.env.GIT_REPOSITORY_URL;
const commitSha = process.env.NX_COMMIT_SHA;
const commitRef = process.env.NX_COMMIT_REF;
const branch = process.env.NX_BRANCH;
const depth = process.env.GIT_CHECKOUT_DEPTH || 1;

execSync('git init .');
execSync(`git remote add origin ${repoUrl}`);
execSync(
  `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=${depth} origin +${commitSha}:${commitRef}`
);
execSync(`git checkout --progress --force -B ${branch} ${commitRef}`);
