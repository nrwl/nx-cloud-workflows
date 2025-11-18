// main.ts
var import_child_process = require("child_process");
var repoUrl = process.env.GIT_REPOSITORY_URL;
var commitSha = process.env.NX_COMMIT_SHA;
var nxBranch = process.env.NX_BRANCH;
var depth = process.env.GIT_CHECKOUT_DEPTH || 1;
var fetchTags = process.env.GIT_FETCH_TAGS === "true";
var maxRetries = 3;
async function main() {
  if (process.platform != "win32") {
    (0, import_child_process.execSync)(`git config --global --add safe.directory $PWD`);
  }
  (0, import_child_process.execSync)("git init .");
  (0, import_child_process.execSync)(`git remote add origin ${repoUrl}`);
  (0, import_child_process.execSync)(`echo "GIT_REPOSITORY_URL=''" >> $NX_CLOUD_ENV`);
  let fetchCommand;
  if (commitSha.startsWith("origin/")) {
    fetchCommand = `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=1 origin ${nxBranch}`;
  } else {
    if (depth === "0") {
      fetchCommand = 'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*" "+refs/pull/*/head:refs/remotes/origin/pr/*"';
    } else {
      const tagsArg = fetchTags ? " --tags" : "--no-tags";
      fetchCommand = `git fetch ${tagsArg} --prune --progress --no-recurse-submodules --depth=${depth} origin ${commitSha}`;
    }
  }
  await runWithRetries(() => (0, import_child_process.execSync)(fetchCommand), "git fetch", maxRetries);
  const checkoutCommand = `git checkout --progress --force -B ${nxBranch} ${commitSha}`;
  await runWithRetries(
    () => (0, import_child_process.execSync)(checkoutCommand),
    "git checkout",
    maxRetries
  );
}
async function runWithRetries(fn, label, maxRetriesLocal) {
  let attempt = 0;
  while (attempt < maxRetriesLocal) {
    try {
      fn();
      return;
    } catch (e) {
      attempt++;
      if (attempt >= maxRetriesLocal) {
        throw e;
      }
      const delayMs = attempt === 1 ? 1e4 : 6e4;
      const stderr = e?.stderr?.toString?.() || "";
      const stdout = e?.stdout?.toString?.() || "";
      if (stderr) {
        console.error(stderr.trim());
      }
      if (stdout) {
        console.log(stdout.trim());
      }
      console.log(
        `
--- ${label} attempt ${attempt} failed; retrying in ${delayMs / 1e3}s ---`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
main().then(() => {
}).catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
