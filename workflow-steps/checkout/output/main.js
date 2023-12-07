// main.ts
var import_child_process = require("child_process");
var repoUrl = process.env.GIT_REPOSITORY_URL;
var commitSha = process.env.NX_COMMIT_SHA;
var nxBranch = process.env.NX_BRANCH;
var depth = process.env.GIT_CHECKOUT_DEPTH || 1;
var isPR = !isNaN(parseInt(nxBranch));
(0, import_child_process.execSync)(`git config --global --add safe.directory /home/workflows/workspace`);
(0, import_child_process.execSync)("git init .");
(0, import_child_process.execSync)(`git remote add origin ${repoUrl}`);
if (depth === "0") {
  (0, import_child_process.execSync)(
    'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*"'
  );
  if (isPR) {
    (0, import_child_process.execSync)(
      `git fetch origin pull/${nxBranch}/head:refs/remotes/origin/pr/${nxBranch}`
    );
  }
  const checkoutRef = isPR ? "refs/remotes/origin/pr/" + nxBranch : commitSha;
  (0, import_child_process.execSync)(`git checkout --progress --force ${checkoutRef}`);
} else {
  const fetchRef = isPR ? `pull/${nxBranch}/head` : `${nxBranch}`;
  (0, import_child_process.execSync)(
    `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=${depth} origin ${fetchRef}`
  );
  const checkoutRef = isPR ? "FETCH_HEAD" : `origin/${nxBranch}`;
  (0, import_child_process.execSync)(`git checkout --progress --force -B ${nxBranch} ${checkoutRef}`);
}
