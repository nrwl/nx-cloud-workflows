// main.ts
var import_child_process = require("child_process");
var repoUrl = process.env.GIT_REPOSITORY_URL;
var commitSha = process.env.NX_COMMIT_SHA;
var nxBranch = process.env.NX_BRANCH;
var depth = process.env.GIT_CHECKOUT_DEPTH || 1;
var fetchTags = process.env.GIT_FETCH_TAGS === "true";
if (process.platform != "win32") {
  (0, import_child_process.execSync)(`git config --global --add safe.directory $PWD`);
}
(0, import_child_process.execSync)("git init .");
(0, import_child_process.execSync)(`git remote add origin ${repoUrl}`);
(0, import_child_process.execSync)(`echo "GIT_REPOSITORY_URL=''" >> $NX_CLOUD_ENV`);
if (depth === "0") {
  (0, import_child_process.execSync)(
    'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*"'
  );
} else {
  const tagsArg = fetchTags ? " --tags" : "--no-tags";
  (0, import_child_process.execSync)(
    `git fetch ${tagsArg} --prune --progress --no-recurse-submodules --depth=${depth} origin ${commitSha}`
  );
}
(0, import_child_process.execSync)(`git checkout --progress --force -B ${nxBranch} ${commitSha}`);
