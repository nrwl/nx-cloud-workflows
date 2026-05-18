import { spawn, SpawnOptions } from 'node:child_process';
import { appendFile } from 'node:fs/promises';

interface GitCheckoutConfig {
  repoUrl: string;
  commitSha: string;
  nxBranch: string;
  depth: number;
  fetchTags: boolean;
  filter: string;
  timeout: number;
  maxRetries: number;
  dryRun: boolean;
  createBranch: boolean;
}

interface RetryableError extends Error {
  isRetryable: boolean;
}

type GitPlatform = 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'unknown';

/**
 * Detects git platform from repository URL
 */
export function detectPlatform(repoUrl: string): GitPlatform {
  const url = repoUrl.toLowerCase();

  if (url.includes('github.com') || url.includes('github.')) {
    return 'github';
  }
  if (url.includes('gitlab.com') || url.includes('gitlab.')) {
    return 'gitlab';
  }
  if (url.includes('bitbucket.org') || url.includes('bitbucket.')) {
    return 'bitbucket';
  }
  if (url.includes('dev.azure.com') || url.includes('visualstudio.com')) {
    return 'azure';
  }

  return 'unknown';
}

/**
 * Detects if nxBranch represents a PR/MR number and returns platform-specific refs
 */
export function getPullRequestRefs(
  platform: GitPlatform,
  prNumber: string,
): string[] {
  switch (platform) {
    case 'github':
      return [
        `+refs/pull/${prNumber}/head:refs/remotes/origin/pr/${prNumber}/head`,
        `+refs/pull/${prNumber}/merge:refs/remotes/origin/pr/${prNumber}/merge`,
      ];
    case 'gitlab':
      return [
        `+refs/merge-requests/${prNumber}/head:refs/remotes/origin/mr/${prNumber}/head`,
        `+refs/merge-requests/${prNumber}/merge:refs/remotes/origin/mr/${prNumber}/merge`,
      ];
    case 'bitbucket':
      return [
        `+refs/pull-requests/${prNumber}/from:refs/remotes/origin/pr/${prNumber}/from`,
        `+refs/pull-requests/${prNumber}/merge:refs/remotes/origin/pr/${prNumber}/merge`,
      ];
    case 'azure':
      return [
        `+refs/pull/${prNumber}/merge:refs/remotes/origin/pr/${prNumber}/merge`,
      ];
    case 'unknown':
    default:
      // For unknown platforms, don't fetch PR refs to avoid unexpected errors
      return [];
  }
}

/**
 * Detects if commitSha is a platform-specific PR/MR reference
 */
export function isPullRequestRef(
  platform: GitPlatform,
  commitSha: string,
): boolean {
  switch (platform) {
    case 'github':
      return /^(refs\/)?pull\/\d+\/(head|merge)$/i.test(commitSha);
    case 'gitlab':
      return /^(refs\/)?merge-requests\/\d+\/(head|merge)$/i.test(commitSha);
    case 'bitbucket':
      return /^(refs\/)?pull-requests\/\d+\/(from|merge)$/i.test(commitSha);
    case 'azure':
      return /^(refs\/)?pull\/\d+\/merge$/i.test(commitSha);
    default:
      return false;
  }
}

/**
 * Detects if commitSha or nxBranch represents a merge queue/train
 */
export function isMergeQueueRef(
  platform: GitPlatform,
  commitSha: string,
  nxBranch: string,
): boolean {
  switch (platform) {
    case 'github':
      // GitHub merge queue: gh-readonly-queue/main/pr-123-abc123def
      return (
        /^(refs\/heads\/)?gh-readonly-queue\//i.test(commitSha) ||
        /^gh-readonly-queue\//i.test(nxBranch)
      );
    case 'gitlab':
      // GitLab merge train: train/main/123 or ends with -merge-train
      return (
        /^(refs\/heads\/)?train\//i.test(commitSha) ||
        /^train\//i.test(nxBranch) ||
        /-merge-train$/i.test(nxBranch)
      );
    case 'azure':
      // Azure merge queue: merge-queue/main/123
      return (
        /^(refs\/heads\/)?merge-queue\//i.test(commitSha) ||
        /^merge-queue\//i.test(nxBranch)
      );
    default:
      return false;
  }
}

class GitCheckoutError extends Error implements RetryableError {
  constructor(
    message: string,
    public readonly isRetryable: boolean = false,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = 'GitCheckoutError';
  }
}

/**
 * Validates and parses environment variables into a typed configuration
 * @throws {GitCheckoutError} If required environment variables are missing or invalid
 */
function validateEnvironment(): GitCheckoutConfig {
  const repoUrl = process.env.GIT_REPOSITORY_URL;
  const commitSha = process.env.NX_COMMIT_SHA;
  const nxBranch = process.env.NX_BRANCH;

  if (!repoUrl) {
    throw new GitCheckoutError(
      'GIT_REPOSITORY_URL environment variable is required',
      false,
    );
  }

  if (!commitSha) {
    throw new GitCheckoutError(
      'NX_COMMIT_SHA environment variable is required',
      false,
    );
  }

  if (!nxBranch) {
    throw new GitCheckoutError(
      'NX_BRANCH environment variable is required',
      false,
    );
  }

  // Validate URL format
  try {
    if (repoUrl.startsWith('git@')) {
      // For SSH URLs, just do basic validation
      if (!repoUrl.match(/^git@[\w\.\-]+:[\w\-\.\/]+(\.git)?$/)) {
        throw new Error('Invalid SSH URL format');
      }
    } else {
      new URL(repoUrl);
    }
  } catch {
    throw new GitCheckoutError(`Invalid GIT_REPOSITORY_URL: ${repoUrl}`, false);
  }

  // Validate commit SHA format - allow SHAs, branch refs, and any valid git ref format
  // This is platform-agnostic and lets git itself validate the ref during fetch
  if (
    !commitSha.match(
      /^[a-fA-F0-9]{6,40}$|^origin\/[\w\-\.\/]+$|^refs\/[\w\-\.\/]+$|^[\w\-\.\/]+\/\d+\/[\w\-]+$/i,
    )
  ) {
    throw new GitCheckoutError(
      `Invalid NX_COMMIT_SHA format: ${commitSha}`,
      false,
    );
  }

  // Parse and validate depth
  const depthStr = process.env.GIT_CHECKOUT_DEPTH || '1';
  const depth = parseInt(depthStr, 10);
  if (isNaN(depth) || depth < 0) {
    throw new GitCheckoutError(
      `Invalid GIT_CHECKOUT_DEPTH: ${depthStr}`,
      false,
    );
  }

  // Parse other configuration
  const fetchTags = process.env.GIT_FETCH_TAGS === 'true';
  const filter = process.env.GIT_FILTER || ''; // Partial clone filter (e.g., 'blob:none', 'tree:0')
  const timeout = parseInt(process.env.GIT_TIMEOUT || '300000', 10); // 5 minutes default
  const maxRetries = parseInt(process.env.GIT_MAX_RETRIES || '3', 10);
  const dryRun = process.env.GIT_DRY_RUN === 'true';
  const createBranch = process.env.GIT_CREATE_BRANCH === 'true';

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
    createBranch,
  };
}

/**
 * Executes a git command safely using spawn with proper argument escaping
 * @param command Git subcommand (e.g., 'init', 'fetch', 'checkout')
 * @param args Array of arguments for the git command
 * @param options Configuration options including timeout and dry-run mode
 * @returns Promise that resolves with the command output or rejects with an error
 */
async function executeGitCommand(
  command: string,
  args: string[],
  options: { timeout?: number; cwd?: string; dryRun?: boolean } = {},
): Promise<{ stdout: string; stderr: string }> {
  const fullArgs = [command, ...args];

  if (options.dryRun) {
    console.log(`[DRY RUN] Would execute: git ${fullArgs.join(' ')}`);
    return { stdout: '', stderr: '' };
  }

  return new Promise((resolve, reject) => {
    const spawnOptions: SpawnOptions = {
      cwd: options.cwd || process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      timeout: options.timeout,
    };

    const child = spawn('git', fullArgs, spawnOptions);

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      // Show real-time progress for long-running operations
      if (command === 'fetch' || command === 'checkout') {
        process.stdout.write(output);
      }
    });

    child.stderr?.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      // Git often outputs progress to stderr
      if (command === 'fetch' || command === 'checkout') {
        process.stderr.write(output);
      }
    });

    child.on('error', (error) => {
      reject(classifyError(error, command));
    });

    child.on('exit', (code, signal) => {
      if (signal === 'SIGTERM' && options.timeout) {
        reject(
          new GitCheckoutError(
            `Git ${command} timed out after ${options.timeout}ms`,
            true,
          ),
        );
      } else if (code !== 0) {
        reject(classifyError(new Error(stderr || stdout), command));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

/**
 * Classifies errors to determine if they are retryable
 * @param error The error to classify
 * @param command The git command that failed
 * @returns A GitCheckoutError with isRetryable flag set appropriately
 */
function classifyError(error: Error, command: string): GitCheckoutError {
  const message = error.message || error.toString();
  const lowerMessage = message.toLowerCase();

  // Network and connection errors - retryable
  if (
    lowerMessage.includes('connection') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('early eof') ||
    lowerMessage.includes('network') ||
    lowerMessage.includes('could not read from remote') ||
    lowerMessage.includes('unable to access') ||
    lowerMessage.includes("couldn't resolve host")
  ) {
    return new GitCheckoutError(
      `Network error during git ${command}: ${message}`,
      true,
      error,
    );
  }

  // Authentication errors - not retryable
  if (
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('permission denied') ||
    lowerMessage.includes('could not read username') ||
    lowerMessage.includes('invalid username or password')
  ) {
    return new GitCheckoutError(
      `Authentication error during git ${command}: ${message}`,
      false,
      error,
    );
  }

  // Reference errors - not retryable
  if (
    lowerMessage.includes('not found') ||
    lowerMessage.includes("couldn't find remote ref") ||
    lowerMessage.includes('invalid ref') ||
    lowerMessage.includes('pathspec') ||
    lowerMessage.includes('did not match any')
  ) {
    return new GitCheckoutError(
      `Reference error during git ${command}: ${message}`,
      false,
      error,
    );
  }

  // Default to non-retryable
  return new GitCheckoutError(
    `Git ${command} failed: ${message}`,
    false,
    error,
  );
}

/**
 * Executes a function with retry logic using exponential backoff
 * @param fn The async function to execute
 * @param label A label for logging purposes
 * @param maxRetries Maximum number of retry attempts
 * @returns Promise that resolves when the function succeeds or rejects after all retries
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const gitError = error as GitCheckoutError;
      if (!gitError.isRetryable || attempt >= maxRetries) {
        throw error;
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = attempt === 1 ? 10000 : 30000; // 10s for first retry, 30s for subsequent
      // Add random jitter to prevent thundering herd problem - if multiple processes fail
      // simultaneously, jitter spreads out retry attempts to avoid overwhelming the server
      const jitter = Math.random() * 5000; // 0-5s random jitter
      const delay = baseDelay * Math.pow(1.5, attempt - 1) + jitter;
      const maxDelay = 120000; // Cap at 2 minutes
      const actualDelay = Math.min(delay, maxDelay);

      console.log(
        `\n--- ${label} attempt ${attempt} failed (retryable error); retrying in ${Math.round(actualDelay / 1000)}s ---`,
      );
      console.log(`Error: ${gitError.message}`);

      await new Promise((resolve) => setTimeout(resolve, actualDelay));
    }
  }

  throw lastError;
}

/**
 * Writes environment variable to NX_CLOUD_ENV file in a cross-platform way
 * @param key The environment variable key
 * @param value The environment variable value
 */
async function writeToNxCloudEnv(key: string, value: string): Promise<void> {
  const nxCloudEnvPath = process.env.NX_CLOUD_ENV;
  if (!nxCloudEnvPath) {
    console.warn('NX_CLOUD_ENV not set, skipping environment variable write');
    return;
  }

  try {
    const line = `${key}='${value}'\n`;
    await appendFile(nxCloudEnvPath, line, 'utf8');
  } catch (error) {
    console.warn(`Failed to write to NX_CLOUD_ENV: ${error}`);
  }
}

/**
 * Builds the appropriate git fetch command based on configuration
 * @param config The validated configuration
 * @returns Array of arguments for the git fetch command
 */
function buildFetchCommand(config: GitCheckoutConfig): string[] {
  const args: string[] = [];
  const platform = detectPlatform(config.repoUrl);

  // Handle refs/heads/ format (standard git ref format)
  const headRefMatch = config.commitSha.match(/^refs\/heads\/(.+)$/i);
  if (headRefMatch) {
    const branchName = headRefMatch[1];
    args.push(
      '--no-tags',
      '--prune',
      '--progress',
      '--no-recurse-submodules',
      `--depth=${config.depth}`,
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push(
      'origin',
      `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`,
    );
  } else if (config.commitSha.startsWith('origin/')) {
    // This is a branch reference, not a SHA
    const branchName = config.commitSha.replace('origin/', '');
    args.push(
      '--no-tags',
      '--prune',
      '--progress',
      '--no-recurse-submodules',
      '--depth=1',
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push('origin', branchName);
  } else if (isMergeQueueRef(platform, config.commitSha, config.nxBranch)) {
    // This is a merge queue/train branch - treat like a regular branch
    // Use commitSha if it matches queue pattern, otherwise use nxBranch
    let queueBranch: string;
    if (
      /^(refs\/heads\/)?gh-readonly-queue\//i.test(config.commitSha) ||
      /^(refs\/heads\/)?train\//i.test(config.commitSha) ||
      /^(refs\/heads\/)?merge-queue\//i.test(config.commitSha)
    ) {
      queueBranch = config.commitSha.startsWith('refs/heads/')
        ? config.commitSha.replace('refs/heads/', '')
        : config.commitSha;
    } else {
      // commitSha is regular SHA, use nxBranch for branch name
      queueBranch = config.nxBranch;
    }

    args.push(
      '--no-tags',
      '--prune',
      '--progress',
      '--no-recurse-submodules',
      `--depth=${config.depth}`,
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push(
      'origin',
      `+refs/heads/${queueBranch}:refs/remotes/origin/${queueBranch}`,
    );
  } else if (isPullRequestRef(platform, config.commitSha)) {
    // This is a platform-specific PR/MR reference
    args.push(
      '--no-tags',
      '--prune',
      '--progress',
      '--no-recurse-submodules',
      `--depth=${config.depth}`,
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }

    // Add appropriate ref spec based on platform
    if (config.commitSha.startsWith('refs/')) {
      args.push(
        'origin',
        `${config.commitSha}:refs/remotes/origin/${config.commitSha}`,
      );
    } else {
      args.push(
        'origin',
        `refs/${config.commitSha}:refs/remotes/origin/${config.commitSha}`,
      );
    }
  } else if (config.depth === 0) {
    // Full clone - fetch all branches and tags
    args.push('--prune', '--progress', '--no-recurse-submodules', '--tags');
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push('origin', '+refs/heads/*:refs/remotes/origin/*');

    // Additionally fetch PR/MR refs if we're in a PR context
    // PR context is detected when nxBranch is a numeric PR/MR number
    // BUT exclude merge queues which may contain numeric patterns
    if (
      config.nxBranch.match(/^\d+$/) &&
      !isMergeQueueRef(platform, config.commitSha, config.nxBranch)
    ) {
      const prNumber = config.nxBranch;
      const prRefs = getPullRequestRefs(platform, prNumber);
      args.push(...prRefs);
    }
  } else {
    // Regular SHA with depth
    const tagsArg = config.fetchTags ? '--tags' : '--no-tags';
    args.push(
      tagsArg,
      '--prune',
      '--progress',
      '--no-recurse-submodules',
      `--depth=${config.depth}`,
    );
    if (config.filter) {
      args.push(`--filter=${config.filter}`);
    }
    args.push('origin', config.commitSha);
  }

  return args;
}

/**
 * Main function to perform git checkout with all safety and reliability features
 */
async function main(): Promise<void> {
  let config: GitCheckoutConfig;

  try {
    config = validateEnvironment();
  } catch (error) {
    console.error('Configuration error:', (error as Error).message);
    process.exit(1);
  }

  console.log('Git checkout configuration:');
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
    console.log('  Mode: DRY RUN');
  }
  console.log('');

  try {
    /**
     * Configure git safe directory (not on windows)
     *
     * Skips configuration on Windows because:
     * 1. 'git config --global' typically requires elevated (admin) privileges on Windows.
     * 2. The 'safe.directory' security feature is less significant on Windows due to
     *    differing permission and ownership semantics compared to Unix-like systems.
     */
    if (process.platform !== 'win32') {
      const cwd = process.cwd();
      await executeGitCommand(
        'config',
        ['--global', '--add', 'safe.directory', cwd],
        {
          timeout: config.timeout,
          dryRun: config.dryRun,
        },
      );
    }

    // Initialize repository
    console.log('Initializing git repository...');
    await executeGitCommand('init', ['.'], {
      timeout: config.timeout,
      dryRun: config.dryRun,
    });

    // Add remote
    console.log('Adding remote origin...');
    await executeGitCommand('remote', ['add', 'origin', config.repoUrl], {
      timeout: config.timeout,
      dryRun: config.dryRun,
    });

    // Clear the repository URL from environment
    await writeToNxCloudEnv('GIT_REPOSITORY_URL', '');

    // Fetch with retries
    console.log('Fetching from remote...');
    const fetchArgs = buildFetchCommand(config);
    await executeWithRetry(
      () =>
        executeGitCommand('fetch', fetchArgs, {
          timeout: config.timeout,
          dryRun: config.dryRun,
        }),
      'git fetch',
      config.maxRetries,
    );

    // Determine what to checkout
    // Check if this is a refs/heads/ format (for both checkout target and branch detection)
    const headRefMatch = config.commitSha.match(/^refs\/heads\/(.+)$/i);

    let checkoutTarget: string;
    if (headRefMatch) {
      // For refs/heads/branch, checkout origin/branch
      checkoutTarget = `origin/${headRefMatch[1]}`;
    } else if (config.commitSha.startsWith('origin/')) {
      checkoutTarget = config.commitSha;
    } else if (config.commitSha.startsWith('pull/')) {
      checkoutTarget = `origin/${config.commitSha}`;
    } else {
      checkoutTarget = config.commitSha;
    }

    // Checkout with retries
    // Match GitHub Actions: create branch for refs/heads/*, detach for everything else
    // Allow manual override via GIT_CREATE_BRANCH env var for backwards compatibility
    const shouldCreateBranch = config.createBranch || headRefMatch;

    let checkoutArgs: string[];

    if (shouldCreateBranch) {
      // Determine branch name
      const branchName = headRefMatch
        ? headRefMatch[1] // Extract captured branch name from refs/heads/
        : config.nxBranch; // Manual override - use nxBranch

      checkoutArgs = [
        '--progress',
        '--force',
        '-B',
        branchName,
        checkoutTarget,
      ];
    } else {
      // Detached HEAD for PRs, tags, and SHAs (default CI behavior)
      checkoutArgs = ['--progress', '--force', '--detach', checkoutTarget];
    }

    console.log(`Checking out ${checkoutTarget}...`);
    await executeWithRetry(
      () =>
        executeGitCommand('checkout', checkoutArgs, {
          timeout: config.timeout,
          dryRun: config.dryRun,
        }),
      'git checkout',
      config.maxRetries,
    );

    // Verify checkout (unless in dry-run mode)
    if (!config.dryRun) {
      console.log('Verifying checkout...');
      const { stdout: currentSha } = await executeGitCommand(
        'rev-parse',
        ['HEAD'],
        {
          timeout: config.timeout,
        },
      );

      const expectedSha =
        config.commitSha.startsWith('origin/') ||
        config.commitSha.startsWith('pull/')
          ? currentSha.trim() // For branches/PRs, we accept whatever was checked out
          : config.commitSha;

      if (
        !config.commitSha.startsWith('origin/') &&
        !config.commitSha.startsWith('pull/') &&
        !currentSha.trim().startsWith(expectedSha.substring(0, 7))
      ) {
        throw new GitCheckoutError(
          `Checkout verification failed. Expected ${expectedSha}, but HEAD is at ${currentSha.trim()}`,
          false,
        );
      }

      console.log(`Successfully checked out ${currentSha.trim()}`);
    }
  } catch (error) {
    const gitError = error as GitCheckoutError;
    console.error('Git checkout failed:', gitError.message);
    if (gitError.originalError) {
      console.error('Original error:', gitError.originalError.message);
    }
    process.exit(1);
  }
}

// Export for testing
export {
  buildFetchCommand,
  classifyError,
  executeGitCommand,
  executeWithRetry,
  GitCheckoutConfig,
  GitCheckoutError,
  validateEnvironment,
  writeToNxCloudEnv,
};

// Run if this is the main module
if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}
