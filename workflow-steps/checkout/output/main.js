// main.ts
var import_child_process = require('child_process');
var repoUrl = process.env.GIT_REPOSITORY_URL;
var commitSha = process.env.NX_COMMIT_SHA;
var commitRef = process.env.NX_COMMIT_REF;
var branch = process.env.NX_BRANCH;
var depth = process.env.GIT_CHECKOUT_DEPTH ?? 1;
var fetchTags = process.env.GIT_FETCH_TAGS === 'true';
console.log({
  rawDepth: process.env.GIT_CHECKOUT_DEPTH,
  resolvedDepth: depth,
  to: typeof process.env.GIT_CHECKOUT_DEPTH,
  rto: typeof depth,
});
(0, import_child_process.execSync)(
  `git config --global --add safe.directory /home/workflows/workspace`,
);
(0, import_child_process.execSync)('git init .');
(0, import_child_process.execSync)(`git remote add origin ${repoUrl}`);
if (Number(depth) === 0) {
  (0, import_child_process.execSync)(
    `git fetch --prune --progress --no-recurse-submodules --tags origin ${commitRef}`,
  );
} else {
  const tagOption = fetchTags ? '--tags' : '--no-tags';
  (0, import_child_process.execSync)(
    `git fetch ${tagOption} --prune --progress --no-recurse-submodules --depth=${depth} origin +${commitSha}:${commitRef}`,
  );
}
(0, import_child_process.execSync)(
  `git checkout --progress --force -B ${branch} ${commitRef}`,
);
