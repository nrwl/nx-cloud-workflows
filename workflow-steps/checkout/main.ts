import { execSync } from "child_process";

const repoUrl = process.env.GIT_REPOSITORY_URL;
const commitSha = process.env.NX_COMMIT_SHA;
const commitRef = process.env.NX_COMMIT_REF;
const branch = process.env.NX_BRANCH;
// A valid special-case depth can be zero (full history and tags), so we don't want to use || here
const depth = process.env.GIT_CHECKOUT_DEPTH ?? 1;
const fetchTags = process.env.GIT_FETCH_TAGS === "true";

console.log({
  rawDepth: process.env.GIT_CHECKOUT_DEPTH,
  resolvedDepth: depth,
  to: typeof process.env.GIT_CHECKOUT_DEPTH,
  rto: typeof depth,
});

execSync(`git config --global --add safe.directory /home/workflows/workspace`);
execSync("git init .");
execSync(`git remote add origin ${repoUrl}`);

if (Number(depth) === 0) {
  // Fetch all history and tags if depth is 0
  execSync(
    `git fetch --prune --progress --no-recurse-submodules --tags origin ${commitRef}`
  );
} else {
  // Fetch with specified depth and optionally tags
  const tagOption = fetchTags ? "--tags" : "--no-tags";
  execSync(
    `git fetch ${tagOption} --prune --progress --no-recurse-submodules --depth=${depth} origin +${commitSha}:${commitRef}`
  );
}

execSync(`git checkout --progress --force -B ${branch} ${commitRef}`);
