//@ts-check
const { execSync, exec } = require('child_process');
const { existsSync, readFileSync, readdirSync } = require('fs');

const PER_ATTEMPT_TIMEOUT_MS =
  Number(process.env.NX_CLOUD_INPUT_timeout_ms) || 5 * 60 * 1000;
const IDLE_TIMEOUT_MS =
  Number(process.env.NX_CLOUD_INPUT_idle_timeout_ms) || 90 * 1000;
const KILL_GRACE_MS = 5_000;
const DEBUG_NAMESPACES = 'pw:install';

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});

async function main() {
  if (!existsSync('package.json')) {
    console.log(
      'Unable to determine which e2e test runner being used. Missing root level package.json file',
    );
    return;
  }

  const json = JSON.parse(readFileSync('package.json').toString());
  const hasPlaywright =
    (json.dependencies || {}).hasOwnProperty('@playwright/test') ||
    (json.devDependencies || {}).hasOwnProperty('@playwright/test');

  const hasCypress =
    (json.dependencies || {}).hasOwnProperty('cypress') ||
    (json.devDependencies || {}).hasOwnProperty('cypress');

  if (hasPlaywright) {
    console.log(
      `Installing browsers required by Playwright (idle-timeout=${IDLE_TIMEOUT_MS / 1000}s, absolute-timeout=${PER_ATTEMPT_TIMEOUT_MS / 1000}s, DEBUG+=${DEBUG_NAMESPACES})`,
    );
    try {
      const output = await runCmdAsync(
        `${getPackageManagerCommand()} playwright install`,
      );

      // we can special handle missing deps for failed install
      if (output.code !== 0 && output.stderr.includes('apt-get install')) {
        console.log(
          '\nDetected missing Playwright dependencies. Attempting manual install...',
        );
        // playwright has detected out of sync dependencies on the host machine, we we'll try to manually install them to prevent hard to debug failures
        const [installCommand] =
          output.stderr.match(/apt-get install (\b\w+\b )+/gi) || [];
        if (installCommand) {
          const depsInstalled = installDeps(`sudo ${installCommand.trim()} -y`);
          if (!depsInstalled) {
            console.error(
              'Failed to install system dependencies for Playwright.',
            );
            process.exit(1);
          }
          console.log('Re-attempting to install browsers...');
          const reattempt = await runCmdAsync(`${getPackageManagerCommand()}  playwright install`);
          if (reattempt.code !== 0) {
            console.error(
              'Failed to install Playwright browsers after installing system dependencies.',
            );
            printFailureContext(reattempt);
            process.exit(reattempt.code);
          }
          console.log('Successfully installed Playwright browsers.');
        } else {
          console.error('Unable to handle failure automatically.');
          printFailureContext(output);
          process.exit(output.code);
        }
      } else if (output.code !== 0) {
        console.error(
          'There was an issue installing Playwright browsers. See above logs.',
        );
        printFailureContext(output);
        process.exit(output.code);
      }
    } catch (e) {
      console.error(e);
      console.error('There is an issue installing Playwright dependencies');
      process.exit(1);
    }
  }

  if (hasCypress) {
    console.log('Installing browsers required by Cypress');
    execSync(`${getPackageManagerCommand()} cypress install`, {
      stdio: 'inherit',
    });
  }
  console.log('Done');
}

/**
 * @param {string} cmd
 * @returns {Promise<{ stdout: string; stderr: string; code: number; killedByTimeout: boolean; killReason: string | null; }>}
 */
async function runCmdAsync(cmd) {
  return new Promise((res, reject) => {
    let stdout = '';
    let stderr = '';
    let killedByTimeout = false;
    /** @type {string | null} */
    let killReason = null;
    /** @type {NodeJS.Timeout | null} */
    let graceTimer = null;
    /** @type {NodeJS.Timeout | null} */
    let idleTimer = null;

    const childEnv = { ...process.env };
    childEnv.DEBUG = childEnv.DEBUG
      ? `${childEnv.DEBUG},${DEBUG_NAMESPACES}`
      : DEBUG_NAMESPACES;

    const proc = exec(cmd, { env: childEnv });
    const rootPid = proc.pid;

    function escalateKill() {
      killedByTimeout = true;
      captureProcessSnapshot(rootPid, killReason || 'timeout');
      process.stderr.write(
        `\nInstall Browsers: sending SIGTERM to pid ${rootPid} and its descendants. ` +
          `SIGKILL in ${KILL_GRACE_MS / 1000}s if anything is still running.\n`,
      );
      killTree(rootPid, 'SIGTERM');
      graceTimer = setTimeout(() => {
        if (proc.exitCode === null && proc.signalCode === null) {
          process.stderr.write(
            `Install Browsers: grace expired, sending SIGKILL to pid ${rootPid} and its descendants.\n`,
          );
          killTree(rootPid, 'SIGKILL');
        }
      }, KILL_GRACE_MS);
      graceTimer.unref();
    }

    const absoluteTimer = setTimeout(() => {
      const seconds = Math.round(PER_ATTEMPT_TIMEOUT_MS / 1000);
      killReason = `absolute timeout (${seconds}s elapsed)`;
      process.stderr.write(
        `\nInstall Browsers: \`${cmd}\` reached absolute timeout of ${seconds}s.\n`,
      );
      escalateKill();
    }, PER_ATTEMPT_TIMEOUT_MS);
    absoluteTimer.unref();

    function resetIdleTimer() {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        const seconds = Math.round(IDLE_TIMEOUT_MS / 1000);
        killReason = `idle timeout (no output for ${seconds}s)`;
        process.stderr.write(
          `\nInstall Browsers: \`${cmd}\` produced no output for ${seconds}s.\n`,
        );
        escalateKill();
      }, IDLE_TIMEOUT_MS);
      idleTimer.unref();
    }
    resetIdleTimer();

    proc?.stdout?.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
      resetIdleTimer();
    });

    proc?.stderr?.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
      resetIdleTimer();
    });

    proc.on('error', (error) => {
      clearTimeout(absoluteTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (graceTimer) clearTimeout(graceTimer);
      reject(error);
    });

    proc.on('close', (code, signal) => {
      clearTimeout(absoluteTimer);
      if (idleTimer) clearTimeout(idleTimer);
      if (graceTimer) clearTimeout(graceTimer);
      const resolvedCode =
        code !== null
          ? code
          : signal === 'SIGKILL'
            ? 137
            : signal === 'SIGTERM'
              ? 143
              : 1;
      res({
        stdout,
        stderr,
        code: resolvedCode,
        killedByTimeout,
        killReason,
      });
    });
  });
}

/**
 * @param {{ stdout: string; stderr: string; killedByTimeout: boolean; killReason: string | null; }} output
 */
function printFailureContext(output) {
  if (output.killedByTimeout) {
    console.error(
      `\nThe command was terminated: ${output.killReason}. This often indicates a stalled download or extraction; if an Install Node step ran earlier in the workflow, that's the most likely interaction.`,
    );
  }
  const lastStdout = output.stdout.split('\n').filter(Boolean).slice(-5).join('\n');
  const lastStderr = output.stderr.split('\n').filter(Boolean).slice(-5).join('\n');
  if (lastStdout) {
    console.error(`\nLast stdout lines:\n${lastStdout}`);
  }
  if (lastStderr) {
    console.error(`\nLast stderr lines:\n${lastStderr}`);
  }
}

/**
 * @param {number | undefined} rootPid
 * @returns {number[]} root pid followed by all descendant pids (BFS order)
 */
function collectDescendants(rootPid) {
  if (!rootPid) return [];
  /** @type {number[]} */
  const result = [];
  try {
    /** @type {Map<number, number[]>} */
    const childrenOf = new Map();
    const pids = readdirSync('/proc')
      .filter((n) => /^\d+$/.test(n))
      .map(Number);
    for (const pid of pids) {
      try {
        const status = readFileSync(`/proc/${pid}/status`, 'utf8');
        const m = status.match(/^PPid:\s*(\d+)/m);
        if (m) {
          const ppid = Number(m[1]);
          if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
          /** @type {number[]} */ (childrenOf.get(ppid)).push(pid);
        }
      } catch (e) {
        // process exited between readdir and read; skip
      }
    }
    /** @type {number[]} */
    const queue = [rootPid];
    /** @type {Set<number>} */
    const seen = new Set();
    while (queue.length) {
      const pid = /** @type {number} */ (queue.shift());
      if (seen.has(pid)) continue;
      seen.add(pid);
      result.push(pid);
      const kids = childrenOf.get(pid) || [];
      queue.push(...kids);
    }
  } catch (e) {
    // /proc not available (e.g. darwin) — fall back to just root
    return [rootPid];
  }
  return result;
}

/**
 * @param {number | undefined} rootPid
 * @param {string} reason
 */
function captureProcessSnapshot(rootPid, reason) {
  process.stderr.write(
    `\n=== Process snapshot (${reason}) for rootPid=${rootPid} ===\n`,
  );
  try {
    const out = execSync('ps auxf 2>&1', {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    process.stderr.write(`# ps auxf\n${out}\n`);
  } catch (e) {
    process.stderr.write(`ps auxf failed: ${e.message}\n`);
  }
  const descendants = collectDescendants(rootPid);
  for (const pid of descendants) {
    process.stderr.write(`\n# pid ${pid}\n`);
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      const filtered = status
        .split('\n')
        .filter((l) => /^(Name|State|PPid|Threads|VmRSS):/.test(l))
        .join('\n');
      process.stderr.write(`status:\n${filtered}\n`);
    } catch (e) {
      process.stderr.write(`status unreadable: ${e.message}\n`);
    }
    try {
      const wchan = readFileSync(`/proc/${pid}/wchan`, 'utf8').trim();
      process.stderr.write(`wchan: ${wchan || '(empty)'}\n`);
    } catch (e) {
      // /proc/<pid>/wchan may be unreadable; skip
    }
    try {
      const cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8')
        .replace(/\0/g, ' ')
        .trim();
      process.stderr.write(`cmdline: ${cmdline}\n`);
    } catch (e) {
      // skip
    }
    try {
      const fds = execSync(`ls -l /proc/${pid}/fd 2>&1 | head -40`, {
        encoding: 'utf8',
        timeout: 5000,
        shell: '/bin/bash',
      });
      process.stderr.write(`fds (first 40 lines):\n${fds}`);
    } catch (e) {
      process.stderr.write(`fd list failed: ${e.message}\n`);
    }
  }
  process.stderr.write(`=== End process snapshot ===\n\n`);
}

/**
 * @param {number | undefined} rootPid
 * @param {NodeJS.Signals} signal
 */
function killTree(rootPid, signal) {
  if (!rootPid) return;
  const descendants = collectDescendants(rootPid);
  for (const pid of descendants.slice().reverse()) {
    try {
      process.kill(pid, signal);
    } catch (e) {
      // already exited
    }
  }
}

function getPackageManagerCommand() {
  if (existsSync('package-lock.json')) {
    return 'npx';
  } else if (existsSync('yarn.lock')) {
    return 'yarn';
  } else if (existsSync('pnpm-lock.yaml') || existsSync('pnpm-lock.yml')) {
    return 'pnpm exec';
  }
}

/**
 * @param {string} installCommand
 * @returns {boolean} true if installation succeeded, false otherwise
 */
function installDeps(installCommand) {
  try {
    console.log(`Running "${installCommand}"`);
    execSync(installCommand.trim(), { stdio: 'inherit' });
    return true;
  } catch (installError) {
    console.error('There was an issue installing dependencies for Playwright.');
    console.log(
      'You can create a custom launch template and add a step to manually install the missing Playwright dependencies in order to get around this error.',
    );
    console.log('See docs here: https://nx.dev/ci/reference/launch-templates');
    return false;
  }
}
