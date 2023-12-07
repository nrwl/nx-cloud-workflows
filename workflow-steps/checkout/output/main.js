// main.ts
var import_node_child_process = require("node:child_process");
var repoUrl = process.env.GIT_REPOSITORY_URL;
var commitSha = process.env.NX_COMMIT_SHA;
var branch = process.env.NX_BRANCH;
var depth = process.env.GIT_CHECKOUT_DEPTH || 1;
(0, import_node_child_process.execSync)(`git config --global --add safe.directory /home/workflows/workspace`);
(0, import_node_child_process.execSync)("git init .");
(0, import_node_child_process.execSync)(`git remote add origin ${repoUrl}`);
if (depth === "0") {
  (0, import_node_child_process.execSync)(
    'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*"'
  );
  (0, import_node_child_process.execSync)(`git checkout --progress --force -B ${branch} origin/${branch}`);
} else {
  (0, import_node_child_process.execSync)(
    `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=${depth} origin ${branch}`
  );
  (0, import_node_child_process.execSync)(`git checkout --progress --force -B ${branch} origin/${branch}`);
}
