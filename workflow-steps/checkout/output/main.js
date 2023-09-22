// main.ts
var import_child_process = require("child_process");
var repoUrl = process.env.GIT_REPOSITORY_URL;
var commitSha = process.env.NX_COMMIT_SHA;
var commitRef = process.env.NX_COMMIT_REF;
var branch = process.env.NX_BRANCH;
var depth = process.env.GIT_CHECKOUT_DEPTH || 1;
(0, import_child_process.execSync)("git init .");
(0, import_child_process.execSync)(`git remote add origin ${repoUrl}`);
(0, import_child_process.execSync)(
  `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=${depth} origin +${commitSha}:${commitRef}`
);
(0, import_child_process.execSync)(`git checkout --progress --force -B ${branch} ${commitRef}`);
