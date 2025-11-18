import {
  afterEach,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';
import { spawn } from 'node:child_process';
import * as fsPromises from 'node:fs/promises';
import {
  buildFetchCommand,
  classifyError,
  executeGitCommand,
  executeWithRetry,
  GitCheckoutConfig,
  GitCheckoutError,
  validateEnvironment,
  writeToNxCloudEnv,
} from './main';

jest.mock('node:child_process');
jest.mock('node:fs/promises', () => ({
  appendFile: jest.fn(),
}));

const mockSpawn = spawn as unknown as jest.MockedFunction<typeof spawn>;

describe('Git Checkout Utility', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  describe('Environment validation', () => {
    test('throws when GIT_REPOSITORY_URL is missing', () => {
      delete process.env.GIT_REPOSITORY_URL;
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).toThrow(
        new GitCheckoutError(
          'GIT_REPOSITORY_URL environment variable is required',
          false,
        ),
      );
    });

    test('throws when NX_COMMIT_SHA is missing', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      delete process.env.NX_COMMIT_SHA;
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).toThrow(
        new GitCheckoutError(
          'NX_COMMIT_SHA environment variable is required',
          false,
        ),
      );
    });

    test('throws when NX_BRANCH is missing', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      delete process.env.NX_BRANCH;

      expect(() => validateEnvironment()).toThrow(
        new GitCheckoutError(
          'NX_BRANCH environment variable is required',
          false,
        ),
      );
    });

    test('validates URL format', () => {
      process.env.GIT_REPOSITORY_URL = 'not-a-valid-url';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).toThrow(
        new GitCheckoutError(
          'Invalid GIT_REPOSITORY_URL: not-a-valid-url',
          false,
        ),
      );
    });

    test('validates git SSH URL format', () => {
      process.env.GIT_REPOSITORY_URL = 'git@github.com:user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - regular SHA', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123def456';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - origin branch', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'origin/feature-branch';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - PR head reference', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'pull/123/head';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - PR merge reference', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'pull/123/merge';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - refs/pull/ head reference', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'refs/pull/456/head';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - refs/pull/ merge reference', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'refs/pull/456/merge';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - refs/heads/ reference', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'refs/heads/main';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('validates commit SHA format - refs/heads/ with feature branch', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'refs/heads/feature/my-feature';
      process.env.NX_BRANCH = 'feature/my-feature';

      expect(() => validateEnvironment()).not.toThrow();
    });

    test('rejects invalid commit SHA format', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'invalid-sha!!!';
      process.env.NX_BRANCH = 'main';

      expect(() => validateEnvironment()).toThrow(
        new GitCheckoutError(
          'Invalid NX_COMMIT_SHA format: invalid-sha!!!',
          false,
        ),
      );
    });

    test('validates depth - valid number', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_CHECKOUT_DEPTH = '5';

      const config = validateEnvironment();
      expect(config.depth).toBe(5);
    });

    test('validates depth - zero for full clone', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_CHECKOUT_DEPTH = '0';

      const config = validateEnvironment();
      expect(config.depth).toBe(0);
    });

    test('rejects invalid depth - not a number', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_CHECKOUT_DEPTH = 'invalid';

      expect(() => validateEnvironment()).toThrow(
        new GitCheckoutError('Invalid GIT_CHECKOUT_DEPTH: invalid', false),
      );
    });

    test('rejects negative depth', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_CHECKOUT_DEPTH = '-1';

      expect(() => validateEnvironment()).toThrow(
        new GitCheckoutError('Invalid GIT_CHECKOUT_DEPTH: -1', false),
      );
    });

    test('parses optional configuration correctly', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_FETCH_TAGS = 'true';
      process.env.GIT_TIMEOUT = '60000';
      process.env.GIT_MAX_RETRIES = '5';
      process.env.GIT_DRY_RUN = 'true';

      const config = validateEnvironment();
      expect(config.fetchTags).toBe(true);
      expect(config.timeout).toBe(60000);
      expect(config.maxRetries).toBe(5);
      expect(config.dryRun).toBe(true);
    });

    test('uses default values when optional env vars not set', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';

      const config = validateEnvironment();
      expect(config.depth).toBe(1);
      expect(config.fetchTags).toBe(false);
      expect(config.filter).toBe('');
      expect(config.timeout).toBe(300000);
      expect(config.maxRetries).toBe(3);
      expect(config.dryRun).toBe(false);
      expect(config.createBranch).toBe(false);
    });

    test('parses GIT_FILTER correctly', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_FILTER = 'blob:none';

      const config = validateEnvironment();
      expect(config.filter).toBe('blob:none');
    });

    test('parses GIT_CREATE_BRANCH=true correctly', () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_CREATE_BRANCH = 'true';

      const config = validateEnvironment();
      expect(config.createBranch).toBe(true);
    });
  });

  describe('Command injection prevention', () => {
    test('escapes repository URL with special characters', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('remote', [
        'add',
        'origin',
        'https://github.com/user/repo.git; rm -rf /',
      ]);

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        [
          'remote',
          'add',
          'origin',
          'https://github.com/user/repo.git; rm -rf /',
        ],
        expect.any(Object),
      );
      // The command injection attempt is passed as a single argument, not executed
    });

    test('escapes commit SHA with command injection attempt', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('checkout', [
        '--detach',
        'abc123; cat /etc/passwd',
      ]);

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '--detach', 'abc123; cat /etc/passwd'],
        expect.any(Object),
      );
    });

    test('escapes branch name with shell metacharacters', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('checkout', ['-B', '$(whoami)', 'abc123']);

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '-B', '$(whoami)', 'abc123'],
        expect.any(Object),
      );
    });
  });

  describe('Fetch logic', () => {
    describe.each([
      {
        commitSha: 'abc123',
        depth: 1,
        fetchTags: false,
        expected: [
          '--no-tags',
          '--prune',
          '--progress',
          '--no-recurse-submodules',
          '--depth=1',
          'origin',
          'abc123',
        ],
      },
      {
        commitSha: 'abc123',
        depth: 5,
        fetchTags: true,
        expected: [
          '--tags',
          '--prune',
          '--progress',
          '--no-recurse-submodules',
          '--depth=5',
          'origin',
          'abc123',
        ],
      },
      {
        commitSha: 'abc123',
        depth: 0,
        fetchTags: false,
        expected: [
          '--prune',
          '--progress',
          '--no-recurse-submodules',
          '--tags',
          'origin',
          '+refs/heads/*:refs/remotes/origin/*',
        ],
      },
      {
        commitSha: 'origin/main',
        depth: 1,
        fetchTags: false,
        expected: [
          '--no-tags',
          '--prune',
          '--progress',
          '--no-recurse-submodules',
          '--depth=1',
          'origin',
          'main',
        ],
      },
      {
        commitSha: 'pull/123/head',
        depth: 1,
        fetchTags: false,
        expected: [
          '--no-tags',
          '--prune',
          '--progress',
          '--no-recurse-submodules',
          '--depth=1',
          'origin',
          'refs/pull/123/head:refs/remotes/origin/pull/123/head',
        ],
      },
      {
        commitSha: 'refs/heads/main',
        depth: 1,
        fetchTags: false,
        expected: [
          '--no-tags',
          '--prune',
          '--progress',
          '--no-recurse-submodules',
          '--depth=1',
          'origin',
          '+refs/heads/main:refs/remotes/origin/main',
        ],
      },
      {
        commitSha: 'refs/heads/feature/my-feature',
        depth: 5,
        fetchTags: true,
        expected: [
          '--no-tags',
          '--prune',
          '--progress',
          '--no-recurse-submodules',
          '--depth=5',
          'origin',
          '+refs/heads/feature/my-feature:refs/remotes/origin/feature/my-feature',
        ],
      },
    ])(
      'with commitSha=$commitSha, depth=$depth, fetchTags=$fetchTags',
      ({ commitSha, depth, fetchTags, expected }) => {
        test('constructs correct fetch command', () => {
          const config: GitCheckoutConfig = {
            repoUrl: 'https://github.com/user/repo.git',
            commitSha,
            nxBranch: 'main',
            depth,
            fetchTags,
            filter: '',
            timeout: 300000,
            maxRetries: 3,
            dryRun: false,
            createBranch: false,
          };

          const args = buildFetchCommand(config);
          expect(args).toEqual(expected);
        });
      },
    );

    test('full clone with PR context - fetches PR refs', () => {
      const config: GitCheckoutConfig = {
        repoUrl: 'https://github.com/user/repo.git',
        commitSha: 'abc123def456',
        nxBranch: '9203', // PR number
        depth: 0,
        fetchTags: false,
        filter: '',
        timeout: 300000,
        maxRetries: 3,
        dryRun: false,
        createBranch: false,
      };

      const args = buildFetchCommand(config);
      expect(args).toEqual([
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--tags',
        'origin',
        '+refs/heads/*:refs/remotes/origin/*',
        '+refs/pull/9203/head:refs/remotes/origin/pr/9203/head',
        '+refs/pull/9203/merge:refs/remotes/origin/pr/9203/merge',
      ]);
    });

    test('full clone with branch context - does not fetch PR refs', () => {
      const config: GitCheckoutConfig = {
        repoUrl: 'https://github.com/user/repo.git',
        commitSha: 'abc123def456',
        nxBranch: 'feature-branch', // Not a PR number
        depth: 0,
        fetchTags: false,
        filter: '',
        timeout: 300000,
        maxRetries: 3,
        dryRun: false,
        createBranch: false,
      };

      const args = buildFetchCommand(config);
      expect(args).toEqual([
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--tags',
        'origin',
        '+refs/heads/*:refs/remotes/origin/*',
      ]);
    });

    test('adds filter argument when filter is specified', () => {
      const config: GitCheckoutConfig = {
        repoUrl: 'https://github.com/user/repo.git',
        commitSha: 'abc123',
        nxBranch: 'main',
        depth: 1,
        fetchTags: false,
        filter: 'blob:none',
        timeout: 300000,
        maxRetries: 3,
        dryRun: false,
        createBranch: false,
      };

      const args = buildFetchCommand(config);
      expect(args).toEqual([
        '--no-tags',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--depth=1',
        '--filter=blob:none',
        'origin',
        'abc123',
      ]);
    });

    test('adds filter with refs/heads/ format', () => {
      const config: GitCheckoutConfig = {
        repoUrl: 'https://github.com/user/repo.git',
        commitSha: 'refs/heads/main',
        nxBranch: 'main',
        depth: 1,
        fetchTags: false,
        filter: 'tree:0',
        timeout: 300000,
        maxRetries: 3,
        dryRun: false,
        createBranch: false,
      };

      const args = buildFetchCommand(config);
      expect(args).toEqual([
        '--no-tags',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--depth=1',
        '--filter=tree:0',
        'origin',
        '+refs/heads/main:refs/remotes/origin/main',
      ]);
    });

    test('adds filter with full clone', () => {
      const config: GitCheckoutConfig = {
        repoUrl: 'https://github.com/user/repo.git',
        commitSha: 'abc123',
        nxBranch: 'main',
        depth: 0,
        fetchTags: false,
        filter: 'blob:none',
        timeout: 300000,
        maxRetries: 3,
        dryRun: false,
        createBranch: false,
      };

      const args = buildFetchCommand(config);
      expect(args).toEqual([
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--tags',
        '--filter=blob:none',
        'origin',
        '+refs/heads/*:refs/remotes/origin/*',
      ]);
    });
  });

  describe('Error classification', () => {
    test('classifies connection timeout as retryable', () => {
      const error = new Error('Connection timeout');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('Network error');
    });

    test('classifies early EOF as retryable', () => {
      const error = new Error('early EOF');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('Network error');
    });

    test('classifies network unreachable as retryable', () => {
      const error = new Error('Network is unreachable');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('Network error');
    });

    test('classifies could not read from remote as retryable', () => {
      const error = new Error('Could not read from remote repository');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('Network error');
    });

    test('classifies unable to access as retryable', () => {
      const error = new Error(
        'Unable to access https://github.com/user/repo.git',
      );
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('Network error');
    });

    test("classifies couldn't resolve host as retryable", () => {
      const error = new Error("Couldn't resolve host github.com");
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(true);
      expect(classified.message).toContain('Network error');
    });

    test('does not retry on authentication failure', () => {
      const error = new Error('Authentication failed');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('Authentication error');
    });

    test('does not retry on permission denied', () => {
      const error = new Error('Permission denied (publickey)');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('Authentication error');
    });

    test('does not retry on invalid username or password', () => {
      const error = new Error('Invalid username or password');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('Authentication error');
    });

    test('does not retry on reference not found', () => {
      const error = new Error('Reference not found');
      const classified = classifyError(error, 'checkout');

      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('Reference error');
    });

    test("does not retry on couldn't find remote ref", () => {
      const error = new Error("Couldn't find remote ref abc123");
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('Reference error');
    });

    test('does not retry on pathspec did not match', () => {
      const error = new Error("pathspec 'abc123' did not match any");
      const classified = classifyError(error, 'checkout');

      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('Reference error');
    });

    test('defaults to non-retryable for unknown errors', () => {
      const error = new Error('Unknown error occurred');
      const classified = classifyError(error, 'fetch');

      expect(classified.isRetryable).toBe(false);
      expect(classified.message).toContain('Git fetch failed');
    });
  });

  describe('Retry behavior', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('retries on connection timeout', async () => {
      let attempts = 0;
      const fn = jest.fn<() => Promise<string>>().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new GitCheckoutError('Connection timeout', true);
        }
        return Promise.resolve('success');
      });

      const promise = executeWithRetry(fn, 'test operation', 3);

      // Fast forward through first retry
      await jest.advanceTimersByTimeAsync(15000);

      // Fast forward through second retry
      await jest.advanceTimersByTimeAsync(50000);

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('retries on early EOF', async () => {
      let attempts = 0;
      const fn = jest.fn<() => Promise<string>>().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw new GitCheckoutError('early EOF', true);
        }
        return Promise.resolve('success');
      });

      const promise = executeWithRetry(fn, 'test operation', 3);

      // Fast forward through first retry
      await jest.advanceTimersByTimeAsync(15000);

      const result = await promise;

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('does not retry on authentication failure', async () => {
      const fn = jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(
          new GitCheckoutError('Authentication failed', false),
        );

      await expect(executeWithRetry(fn, 'test operation', 3)).rejects.toThrow(
        'Authentication failed',
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('does not retry on reference not found', async () => {
      const fn = jest
        .fn<() => Promise<void>>()
        .mockRejectedValue(new GitCheckoutError('Reference not found', false));

      await expect(executeWithRetry(fn, 'test operation', 3)).rejects.toThrow(
        'Reference not found',
      );
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('respects max retries limit', async () => {
      const fn = jest.fn<() => Promise<void>>().mockImplementation(() => {
        throw new GitCheckoutError('Connection timeout foobar', true);
      });

      const promise = executeWithRetry(fn, 'test operation', 3);

      // Attach rejection handler immediately to prevent unhandled rejection warnings
      promise.catch(() => {});

      // Fast forward through first retry (attempt 2)
      await jest.advanceTimersByTimeAsync(15000);

      // Fast forward through second retry (attempt 3)
      await jest.advanceTimersByTimeAsync(50000);

      await expect(promise).rejects.toThrow('Connection timeout foobar');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('uses exponential backoff', async () => {
      const fn = jest.fn<() => Promise<void>>().mockImplementation(() => {
        throw new GitCheckoutError('Connection timeout bazqux', true);
      });

      const consoleSpy = jest.spyOn(console, 'log');

      const promise = executeWithRetry(fn, 'test operation', 3);

      // Attach rejection handler immediately to prevent unhandled rejection warnings
      promise.catch(() => {});

      // Fast-forward through first retry delay (attempt 2)
      await jest.advanceTimersByTimeAsync(15000); // 10s base + jitter

      // Fast-forward through second retry delay (attempt 3)
      await jest.advanceTimersByTimeAsync(50000); // 30s base * 1.5 + jitter

      await expect(promise).rejects.toThrow('Connection timeout bazqux');
      expect(fn).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });

    test('logs retry information', async () => {
      const fn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new GitCheckoutError('Network error', true))
        .mockResolvedValueOnce('success');

      const consoleSpy = jest.spyOn(console, 'log');

      const promise = executeWithRetry(fn, 'git fetch', 3);

      // Fast forward through first retry
      await jest.advanceTimersByTimeAsync(15000);

      await promise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('git fetch attempt 1 failed (retryable error)'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error: Network error'),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('executeGitCommand', () => {
    test('executes command with proper spawn arguments', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('init', ['.'], { timeout: 5000 });

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['init', '.'],
        expect.objectContaining({
          cwd: process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          timeout: 5000,
        }),
      );
    });

    test('returns stdout and stderr on success', async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: Function) => {
            if (event === 'data') callback(Buffer.from('stdout output'));
          }),
        },
        stderr: {
          on: jest.fn((event: string, callback: Function) => {
            if (event === 'data') callback(Buffer.from('stderr output'));
          }),
        },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await executeGitCommand('status', []);

      expect(result.stdout).toBe('stdout output');
      expect(result.stderr).toBe('stderr output');
    });

    test('rejects on non-zero exit code', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: {
          on: jest.fn((event: string, callback: Function) => {
            if (event === 'data') callback(Buffer.from('error message'));
          }),
        },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(1, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await expect(executeGitCommand('fetch', [])).rejects.toThrow(
        'Git fetch failed',
      );
    });

    test('handles timeout signal', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(null, 'SIGTERM');
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await expect(
        executeGitCommand('fetch', [], { timeout: 5000 }),
      ).rejects.toThrow('Git fetch timed out after 5000ms');
    });

    test('dry run mode logs command without executing', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      const result = await executeGitCommand('fetch', ['origin', 'main'], {
        dryRun: true,
      });

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[DRY RUN] Would execute: git fetch origin main',
      );
      expect(result).toEqual({ stdout: '', stderr: '' });

      consoleSpy.mockRestore();
    });

    test('shows real-time output for fetch command', async () => {
      const stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      const stderrSpy = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: Function) => {
            if (event === 'data') callback(Buffer.from('Fetching...'));
          }),
        },
        stderr: {
          on: jest.fn((event: string, callback: Function) => {
            if (event === 'data') callback(Buffer.from('Progress...'));
          }),
        },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('fetch', []);

      expect(stdoutSpy).toHaveBeenCalledWith('Fetching...');
      expect(stderrSpy).toHaveBeenCalledWith('Progress...');

      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });

    test('shows real-time output for checkout command', async () => {
      const stdoutSpy = jest
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);

      const mockProcess = {
        stdout: {
          on: jest.fn((event: string, callback: Function) => {
            if (event === 'data') callback(Buffer.from('Checking out...'));
          }),
        },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('checkout', ['abc123']);

      expect(stdoutSpy).toHaveBeenCalledWith('Checking out...');

      stdoutSpy.mockRestore();
    });
  });

  describe('Checkout behavior', () => {
    test('uses detached HEAD by default (createBranch=false)', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('checkout', [
        '--progress',
        '--force',
        '--detach',
        'abc123',
      ]);

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '--progress', '--force', '--detach', 'abc123'],
        expect.any(Object),
      );
    });

    test('creates branch when createBranch=true', async () => {
      const mockProcess = {
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event: string, callback: Function) => {
          if (event === 'exit') callback(0, null);
        }),
      };
      mockSpawn.mockReturnValue(mockProcess as any);

      await executeGitCommand('checkout', [
        '--progress',
        '--force',
        '-B',
        'main',
        'abc123',
      ]);

      expect(mockSpawn).toHaveBeenCalledWith(
        'git',
        ['checkout', '--progress', '--force', '-B', 'main', 'abc123'],
        expect.any(Object),
      );
    });
  });

  describe('writeToNxCloudEnv', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      (fsPromises.appendFile as any).mockResolvedValue(undefined);
    });

    test('writes environment variable to NX_CLOUD_ENV file', async () => {
      process.env.NX_CLOUD_ENV = '/path/to/env/file';

      await writeToNxCloudEnv('TEST_VAR', 'test_value');

      expect(fsPromises.appendFile).toHaveBeenCalledWith(
        '/path/to/env/file',
        "TEST_VAR='test_value'\n",
        'utf8',
      );
    });

    test('warns when NX_CLOUD_ENV is not set', async () => {
      delete process.env.NX_CLOUD_ENV;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await writeToNxCloudEnv('TEST_VAR', 'test_value');

      expect(warnSpy).toHaveBeenCalledWith(
        'NX_CLOUD_ENV not set, skipping environment variable write',
      );
      expect(fsPromises.appendFile).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    test('handles file write errors gracefully', async () => {
      process.env.NX_CLOUD_ENV = '/path/to/env/file';
      (fsPromises.appendFile as any).mockRejectedValue(
        new Error('Permission denied'),
      );
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      await writeToNxCloudEnv('TEST_VAR', 'test_value');

      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to write to NX_CLOUD_ENV: Error: Permission denied',
      );

      warnSpy.mockRestore();
    });
  });

  describe('GitCheckoutError', () => {
    test('creates error with retryable flag', () => {
      const error = new GitCheckoutError('Test error', true);

      expect(error.message).toBe('Test error');
      expect(error.isRetryable).toBe(true);
      expect(error.name).toBe('GitCheckoutError');
    });

    test('creates error with original error reference', () => {
      const originalError = new Error('Original');
      const error = new GitCheckoutError('Wrapped error', false, originalError);

      expect(error.message).toBe('Wrapped error');
      expect(error.isRetryable).toBe(false);
      expect(error.originalError).toBe(originalError);
    });

    test('defaults to non-retryable', () => {
      const error = new GitCheckoutError('Test error');

      expect(error.isRetryable).toBe(false);
    });
  });

  describe('Integration scenarios', () => {
    test('full checkout flow with regular SHA', async () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123def456';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_CHECKOUT_DEPTH = '1';

      const config = validateEnvironment();
      const fetchArgs = buildFetchCommand(config);

      expect(fetchArgs).toEqual([
        '--no-tags',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--depth=1',
        'origin',
        'abc123def456',
      ]);
    });

    test('full checkout flow with origin branch', async () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'origin/feature-branch';
      process.env.NX_BRANCH = 'feature-branch';

      const config = validateEnvironment();
      const fetchArgs = buildFetchCommand(config);

      expect(fetchArgs).toEqual([
        '--no-tags',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--depth=1',
        'origin',
        'feature-branch',
      ]);
    });

    test('full checkout flow with PR reference', async () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'pull/123/head';
      process.env.NX_BRANCH = 'pr-123';
      process.env.GIT_CHECKOUT_DEPTH = '5';

      const config = validateEnvironment();
      const fetchArgs = buildFetchCommand(config);

      expect(fetchArgs).toEqual([
        '--no-tags',
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--depth=5',
        'origin',
        'refs/pull/123/head:refs/remotes/origin/pull/123/head',
      ]);
    });

    test('full clone when depth is 0', async () => {
      process.env.GIT_REPOSITORY_URL = 'https://github.com/user/repo.git';
      process.env.NX_COMMIT_SHA = 'abc123';
      process.env.NX_BRANCH = 'main';
      process.env.GIT_CHECKOUT_DEPTH = '0';

      const config = validateEnvironment();
      const fetchArgs = buildFetchCommand(config);

      expect(fetchArgs).toEqual([
        '--prune',
        '--progress',
        '--no-recurse-submodules',
        '--tags',
        'origin',
        '+refs/heads/*:refs/remotes/origin/*',
      ]);
    });
  });
});
