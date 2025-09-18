// main.ts
var import_child_process = require("child_process");
var repoUrl = process.env.GIT_REPOSITORY_URL;
var commitSha = process.env.NX_COMMIT_SHA;
var nxBranch = process.env.NX_BRANCH;
var depth = process.env.GIT_CHECKOUT_DEPTH || 1;
var fetchTags = process.env.GIT_FETCH_TAGS === "true";
var maxRetries = 3;
async function main() {
  if (!repoUrl) {
    throw new Error("GIT_REPOSITORY_URL is required");
  }
  if (!commitSha) {
    throw new Error("NX_COMMIT_SHA is required");
  }
  if (!nxBranch) {
    throw new Error("NX_BRANCH is required");
  }
  if (process.platform != "win32") {
    (0, import_child_process.execSync)(`git config --global --add safe.directory $PWD`, {
      stdio: "inherit"
    });
  }
  (0, import_child_process.execSync)("git init .", { stdio: "inherit" });
  (0, import_child_process.execSync)(`git remote add origin ${repoUrl}`);
  (0, import_child_process.execSync)(`echo "GIT_REPOSITORY_URL=''" >> $NX_CLOUD_ENV`);
  let fetchCommand;
  if (commitSha.startsWith("origin/")) {
    fetchCommand = `git fetch --no-tags --prune --progress --no-recurse-submodules --depth=1 origin ${nxBranch}`;
  } else {
    if (depth === "0") {
      fetchCommand = 'git fetch --prune --progress --no-recurse-submodules --tags origin "+refs/heads/*:refs/remotes/origin/*"';
    } else {
      const tagsArg = fetchTags ? " --tags" : "--no-tags";
      fetchCommand = `git fetch ${tagsArg} --prune --progress --no-recurse-submodules --depth=${depth} origin ${commitSha}`;
    }
  }
  await runWithRetries(
    () => (0, import_child_process.execSync)(fetchCommand, { stdio: "inherit" }),
    "git fetch",
    maxRetries
  );
  const checkoutCommand = `git checkout --progress --force -B ${nxBranch} ${commitSha}`;
  await runWithRetries(
    () => (0, import_child_process.execSync)(checkoutCommand, { stdio: "inherit" }),
    "git checkout",
    maxRetries
  );
}
function isNonRetriableError(e) {
  const message = stringifyError(e);
  return /Authentication failed|Invalid username|Invalid user|invalid credentials/i.test(
    message
  );
}
function stringifyError(e) {
  try {
    return [e?.stderr?.toString?.(), e?.stdout?.toString?.(), e?.message].filter(Boolean).join("\n");
  } catch {
    return String(e);
  }
}
async function runWithRetries(fn, label, maxRetriesLocal) {
  let attempt = 0;
  while (attempt < maxRetriesLocal) {
    try {
      fn();
      return;
    } catch (e) {
      attempt++;
      if (isNonRetriableError(e)) {
        throw e;
      }
      if (attempt >= maxRetriesLocal) {
        throw e;
      }
      const delayMs = Math.max(
        3e3,
        Math.pow(2, attempt) * Math.random() * 1250
      );
      console.log(
        `${label} failed. Retrying in ${(delayMs / 1e3).toFixed(
          0
        )} seconds...`
      );
      if (process.env.NX_VERBOSE_LOGGING === "true") {
        console.warn(stringifyError(e));
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
main();
