var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  GitCheckoutError: () => GitCheckoutError,
  buildFetchCommand: () => buildFetchCommand,
  classifyError: () => classifyError,
  detectPlatform: () => detectPlatform,
  executeGitCommand: () => executeGitCommand,
  executeWithRetry: () => executeWithRetry,
  getPullRequestRefs: () => getPullRequestRefs,
  isMergeQueueRef: () => isMergeQueueRef,
  isPullRequestRef: () => isPullRequestRef,
  validateEnvironment: () => validateEnvironment,
  writeToNxCloudEnv: () => writeToNxCloudEnv
});
module.exports = __toCommonJS(main_exports);
var import_node_child_process = require("node:child_process");
var import_promises = require("node:fs/promises");
function detectPlatform(repoUrl) {
  const url = repoUrl.toLowerCase();
  if (url.includes("github.com") || url.includes("github.")) {
    return "github";
  }
  if (url.includes("gitlab.com") || url.includes("gitlab.")) {
    return "gitlab";
  }
  if (url.includes("bitbucket.org") || url.includes("bitbucket.")) {
    return "bitbucket";
  }
  if (url.includes("dev.azure.com") || url.includes("visualstudio.com")) {
    return "azure";
  }
  return "unknown";
}
function getPullRequestRefs(platform, prNumber) {
  switch (platform) {
    case "github":
      return [
        `+refs/pull/${prNumber}/head:refs/remotes/origin/pr/${prNumber}/head`,
        `+refs/pull/${prNumber}/merge:refs/remotes/origin/pr/${prNumber}/merge`
      ];
    case "gitlab":
      return [
        `+refs/merge-requests/${prNumber}/head:refs/remotes/origin/mr/${prNumber}/head`,
        `+refs/merge-requests/${prNumber}/merge:refs/remotes/origin/mr/${prNumber}/merge`
      ];
    case "bitbucket":
      return [
        `+refs/pull-requests/${prNumber}/from:refs/remotes/origin/pr/${prNumber}/from`,
        `+refs/pull-requests/${prNumber}/merge:refs/remotes/origin/pr/${prNumber}/merge`
      ];
    case "azure":
      return [
        `+refs/pull/${prNumber}/merge:refs/remotes/origin/pr/${prNumber}/merge`
      ];
    case "unknown":
    default:
      return [];
  }
}
function isPullRequestRef(platform, commitSha) {
  switch (platform) {
    case "github":
      return /^(refs\/)?pull\/\d+\/(head|merge)$/i.test(commitSha);
    case "gitlab":
      return /^(refs\/)?merge-requests\/\d+\/(head|merge)$/i.test(commitSha);
    case "bitbucket":
      return /^(refs\/)?pull-requests\/\d+\/(from|merge)$/i.test(commitSha);
    case "azure":
      return /^(refs\/)?pull\/\d+\/merge$/i.test(commitSha);
    default:
      return false;
  }
}
function isMergeQueueRef(platform, commitSha, nxBranch) {
  switch (platform) {
    case "github":
      return /^(refs\/heads\/)?gh-readonly-queue\//i.test(commitSha) || /^gh-readonly-queue\//i.test(nxBranch);
    case "gitlab":
      return /^(refs\/heads\/)?train\//i.test(commitSha) || /^train\//i.test(nxBranch) || /-merge-train$/i.test(nxBranch);
    case "azure":
      return /^(refs\/heads\/)?merge-queue\//i.test(commitSha) || /^merge-queue\//i.test(nxBranch);
    default:
      return false;
  }
}
var GitCheckoutError = class extends Error {
  constructor(message, isRetryable = false, originalError) {
    super(message);
    this.isRetryable = isRetryable;
    this.originalError = originalError;
    this.name = "GitCheckoutError";
  }
};
function validateEnvironment() {
  const repoUrl = process.env.GIT_REPOSITORY_URL;
  const commitSha = process.env.NX_COMMIT_SHA;
  const nxBranch = process.env.NX_BRANCH;
  if (!repoUrl) {
    throw new GitCheckoutError(
      "GIT_REPOSITORY_URL environment variable is required",
      false
    );
  }
  if (!commitSha) {
    throw new GitCheckoutError(
      "NX_COMMIT_SHA environment variable is required",
      false
    );
  }
  if (!nxBranch) {
    throw new GitCheckoutError(
      "NX_BRANCH environment variable is required",
      false
    );
  }
  try {
    if (repoUrl.startsWith("git@")) {
      if (!repoUrl.match(/^git@[\w\.\-]+:[\w\-\.\/]+(\.git)?$/)) {
        throw new Error("Invalid SSH URL format");
      }
    } else {
      new URL(repoUrl);
    }
  } catch {
    throw new GitCheckoutError(`Invalid GIT_REPOSITORY_URL: ${repoUrl}`, false);
  }
  if (!commitSha.match(
    /^[a-fA-F0-9]{6,40}$|^origin\/[\w\-\.\/]+$|^refs\/[\w\-\.\/]+$|^[\w\-\.\/]+\/\d+\/[\w\-]+$/i
  )) {
    throw new GitCheckoutError(
      `Invalid NX_COMMIT_SHA format: ${commitSha}`,
      false
    );
  }
  const depthStr = process.env.GIT_CHECKOUT_DEPTH || "1";
  const depth = parseInt(depthStr, 10);
  if (isNaN(depth) || depth < 0) {
    throw new GitCheckoutError(
      `Invalid GIT_CHECKOUT_DEPTH: ${depthStr}`,
      false
    );
  }
  const fetchTags = process.env.GIT_FETCH_TAGS === "true";
  const filter = process.env.GIT_FILTER || "";
  const timeout = parseInt(process.env.GIT_TIMEOUT || "300000", 10);
  const maxRetries = parseInt(process.env.GIT_MAX_RETRIES || "3", 10);
  const dryRun = process.env.GIT_DRY_RUN === "true";
  const createBranch = process.env.GIT_CREATE_BRANCH === "true";
  return {
    repoUrl,
    commitSha,
    nxBranch,
    depth,
    fetchTags,
    filter,
    timeout,
    maxRetries,
    dryRun,
    createBranch
  };
}
async function executeGitCommand(command, args, options = {}) {
  const fullArgs = [command, ...args];
  if (options.dryRun) {
    console.log(`[DRY RUN] Would execute: git ${fullArgs.join(" ")}`);
    return { stdout: "", stderr: "" };
  }
  return new Promise((resolve, reject) => {
    const spawnOptions = {
      cwd: options.cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      timeout: options.timeout
    };
    const child = (0, import_node_child_process.spawn)("git", fullArgs, spawnOptions);
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      const output = data.toString();
      stdout += output;
      if (command === "fetch" || command === "checkout") {
        process.stdout.write(output);
      }
    });
    child.stderr?.on("data", (data) => {
      const output = data.toString();
      stderr += output;
      if (command === "fetch" || command === "checkout") {
        process.stderr.write(output);
      }
    });
    child.on("error", (error) => {
      reject(classifyError(error, command));
    });
    child.on("exit", (code, signal) => {
      if (signal === "SIGTERM" && options.timeout) {
        reject(
          new GitCheckoutError(
            `Git ${command} timed out after ${options.timeout}ms`,
            true
          )
        );
      } else if (code !== 0) {
        reject(classifyError(new Error(stderr || stdout), command));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
function classifyError(error, command) {
  const message = error.message || error.toString();
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("connection") || lowerMessage.includes("timeout") || lowerMessage.includes("early eof") || lowerMessage.includes("network") || lowerMessage.includes("could not read from remote") || lowerMessage.includes("unable to access") || lowerMessage.includes("couldn't resolve host")) {
    return new GitCheckoutError(
      `Network error during git ${command}: ${message}`,
      true,
      error
    );
  }
  if (lowerMessage.includes("authentication") || lowerMessage.includes("permission denied") || lowerMessage.includes("could not read username") || lowerMessage.includes("invalid username or password")) {
    return new GitCheckoutError(
      `Authentication error during git ${command}: ${message}`,
      false,
      error
    );
  }
  if (lowerMessage.includes("not found") || lowerMessage.includes("couldn't find remote ref") || lowerMessage.includes("invalid ref") || lowerMessage.includes("pathspec") || lowerMessage.includes("did not match any")) {
    return new GitCheckoutError(
      `Reference error during git ${command}: ${message}`,
      false,
      error
    );
  }
  return new GitCheckoutError(
    `Git ${command} failed: ${message}`,
    false,
    error
  );
}
async function executeWithRetry(fn, label, maxRetries) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const gitError = error;
      if (!gitError.isRetryable || attempt >= maxRetries) {
        throw error;
      }
      const baseDelay = attempt === 1 ? 1e4 : 3e4;
      const jitter = Math.random() * 5e3;
      const delay = baseDelay * Math.pow(1.5, attempt - 1) + jitter;
      const maxDelay = 12e4;
      const actualDelay = Math.min(delay, maxDelay);
      console.log(
        `
--- ${label} attempt ${attempt} failed (retryable error); retrying in ${Math.round(actualDelay / 1e3)}s ---`
      );
      console.log(`Error: ${gitError.message}`);
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }
  throw lastError;
}
async function writeToNxCloudEnv(key, value) {
  const nxCloudEnvPath = process.env.NX_CLOUD_ENV;
  if (!nxCloudEnvPath) {
    console.warn("NX_CLOUD_ENV not set, skipping environment variable write");
    return;
  }
  try {
    const line = `${key}='${value}'
`;
    await (0, import_promises.appendFile)(nxCloudEnvPath, line, "utf8");
  } catch (error) {
    console.warn(`Failed to write to NX_CLOUD_ENV: ${error}`);
  }
}
function buildFetchCommand(config) {
  const args = [];
  const platform = detectPlatform(config.repoUrl);
  const headRefMatch = config.commitSha.match(/^refs\/heads\/(.+)$/i);
  if (headRefMatch) {
    const branchName = headRefMatch[1];
    args.push(
      "--no-tags",
      "--prune",
      "--progress",
      "--no-recurse-submodules",
      `--depth=${config.depth}`
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push(
      "origin",
      `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`
    );
  } else if (config.commitSha.startsWith("origin/")) {
    const branchName = config.commitSha.replace("origin/", "");
    args.push(
      "--no-tags",
      "--prune",
      "--progress",
      "--no-recurse-submodules",
      "--depth=1"
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push("origin", branchName);
  } else if (isMergeQueueRef(platform, config.commitSha, config.nxBranch)) {
    let queueBranch;
    if (/^(refs\/heads\/)?gh-readonly-queue\//i.test(config.commitSha) || /^(refs\/heads\/)?train\//i.test(config.commitSha) || /^(refs\/heads\/)?merge-queue\//i.test(config.commitSha)) {
      queueBranch = config.commitSha.startsWith("refs/heads/") ? config.commitSha.replace("refs/heads/", "") : config.commitSha;
    } else {
      queueBranch = config.nxBranch;
    }
    args.push(
      "--no-tags",
      "--prune",
      "--progress",
      "--no-recurse-submodules",
      `--depth=${config.depth}`
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push(
      "origin",
      `+refs/heads/${queueBranch}:refs/remotes/origin/${queueBranch}`
    );
  } else if (isPullRequestRef(platform, config.commitSha)) {
    args.push(
      "--no-tags",
      "--prune",
      "--progress",
      "--no-recurse-submodules",
      `--depth=${config.depth}`
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    if (config.commitSha.startsWith("refs/")) {
      args.push(
        "origin",
        `${config.commitSha}:refs/remotes/origin/${config.commitSha}`
      );
    } else {
      args.push(
        "origin",
        `refs/${config.commitSha}:refs/remotes/origin/${config.commitSha}`
      );
    }
  } else if (config.depth === 0) {
    args.push("--prune", "--progress", "--no-recurse-submodules", "--tags");
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push("origin", "+refs/heads/*:refs/remotes/origin/*");
    if (config.nxBranch.match(/^\d+$/) && !isMergeQueueRef(platform, config.commitSha, config.nxBranch)) {
      const prNumber = config.nxBranch;
      const prRefs = getPullRequestRefs(platform, prNumber);
      args.push(...prRefs);
    }
  } else {
    const tagsArg = config.fetchTags ? "--tags" : "--no-tags";
    args.push(
      tagsArg,
      "--prune",
      "--progress",
      "--no-recurse-submodules",
      `--depth=${config.depth}`
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push("origin", config.commitSha);
  }
  return args;
}
async function main() {
  let config;
  try {
    config = validateEnvironment();
  } catch (error) {
    console.error("Configuration error:", error.message);
    process.exit(1);
  }
  console.log("Git checkout configuration:");
  console.log(`  Repository: ${config.repoUrl}`);
  console.log(`  Commit/Ref: ${config.commitSha}`);
  console.log(`  Branch: ${config.nxBranch}`);
  console.log(`  Depth: ${config.depth}`);
  console.log(`  Fetch tags: ${config.fetchTags}`);
  if (config.filter) {
    console.log(`  Filter: ${config.filter}`);
  }
  console.log(`  Create branch: ${config.createBranch}`);
  console.log(`  Timeout: ${config.timeout}ms`);
  console.log(`  Max retries: ${config.maxRetries}`);
  if (config.dryRun) {
    console.log("  Mode: DRY RUN");
  }
  console.log("");
  try {
    if (process.platform !== "win32") {
      const cwd = process.cwd();
      await executeGitCommand(
        "config",
        ["--global", "--add", "safe.directory", cwd],
        {
          timeout: config.timeout,
          dryRun: config.dryRun
        }
      );
    }
    console.log("Initializing git repository...");
    await executeGitCommand("init", ["."], {
      timeout: config.timeout,
      dryRun: config.dryRun
    });
    console.log("Adding remote origin...");
    await executeGitCommand("remote", ["add", "origin", config.repoUrl], {
      timeout: config.timeout,
      dryRun: config.dryRun
    });
    await writeToNxCloudEnv("GIT_REPOSITORY_URL", "");
    console.log("Fetching from remote...");
    const fetchArgs = buildFetchCommand(config);
    await executeWithRetry(
      () => executeGitCommand("fetch", fetchArgs, {
        timeout: config.timeout,
        dryRun: config.dryRun
      }),
      "git fetch",
      config.maxRetries
    );
    const headRefMatch = config.commitSha.match(/^refs\/heads\/(.+)$/i);
    let checkoutTarget;
    if (headRefMatch) {
      checkoutTarget = `origin/${headRefMatch[1]}`;
    } else if (config.commitSha.startsWith("origin/")) {
      checkoutTarget = config.commitSha;
    } else if (config.commitSha.startsWith("pull/")) {
      checkoutTarget = `origin/${config.commitSha}`;
    } else {
      checkoutTarget = config.commitSha;
    }
    const shouldCreateBranch = config.createBranch || headRefMatch;
    let checkoutArgs;
    if (shouldCreateBranch) {
      const branchName = headRefMatch ? headRefMatch[1] : config.nxBranch;
      checkoutArgs = [
        "--progress",
        "--force",
        "-B",
        branchName,
        checkoutTarget
      ];
    } else {
      checkoutArgs = ["--progress", "--force", "--detach", checkoutTarget];
    }
    console.log(`Checking out ${checkoutTarget}...`);
    await executeWithRetry(
      () => executeGitCommand("checkout", checkoutArgs, {
        timeout: config.timeout,
        dryRun: config.dryRun
      }),
      "git checkout",
      config.maxRetries
    );
    if (!config.dryRun) {
      console.log("Verifying checkout...");
      const { stdout: currentSha } = await executeGitCommand(
        "rev-parse",
        ["HEAD"],
        {
          timeout: config.timeout
        }
      );
      const expectedSha = config.commitSha.startsWith("origin/") || config.commitSha.startsWith("pull/") ? currentSha.trim() : config.commitSha;
      if (!config.commitSha.startsWith("origin/") && !config.commitSha.startsWith("pull/") && !currentSha.trim().startsWith(expectedSha.substring(0, 7))) {
        throw new GitCheckoutError(
          `Checkout verification failed. Expected ${expectedSha}, but HEAD is at ${currentSha.trim()}`,
          false
        );
      }
      console.log(`Successfully checked out ${currentSha.trim()}`);
    }
  } catch (error) {
    const gitError = error;
    console.error("Git checkout failed:", gitError.message);
    if (gitError.originalError) {
      console.error("Original error:", gitError.originalError.message);
    }
    process.exit(1);
  }
}
if (require.main === module) {
  main().catch((error) => {
    console.error("Unexpected error:", error);
    process.exit(1);
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GitCheckoutError,
  buildFetchCommand,
  classifyError,
  detectPlatform,
  executeGitCommand,
  executeWithRetry,
  getPullRequestRefs,
  isMergeQueueRef,
  isPullRequestRef,
  validateEnvironment,
  writeToNxCloudEnv
});
