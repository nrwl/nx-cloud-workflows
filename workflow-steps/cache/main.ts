import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';
import { RestoreRequest, RestoreResponse } from './generated_protos/cache_pb';
import { buildCachePaths, hashKey } from './hashing-utils';
import { appendFileSync, writeFileSync, existsSync } from 'fs';

const inputKey = process.env.NX_CLOUD_INPUT_key;
const inputPaths = process.env.NX_CLOUD_INPUT_paths;
const baseBranch =
  process.env.NX_CLOUD_INPUT_base_branch ||
  process.env['NX_CLOUD_INPUT_base-branch'];

export const cacheClient = createPromiseClient(
  CacheService,
  createConnectTransport({
    baseUrl: 'http://127.0.0.1:9000',
  }),
);

const currentBranch = process.env.NX_BRANCH;

if (!inputKey || !inputPaths) {
  throw new Error('No cache restore key or paths provided.');
}

const paths = buildCachePaths(inputPaths, false);
const stringifiedPaths = paths.join(',');
const key = `${inputKey} | "${stringifiedPaths}"`;
const hashedKey = hashKey(key);
const currentBranchKeys = [hashedKey].map((k) => `${currentBranch}-${k}`);
const baseBranchKeys = baseBranch
  ? [hashedKey].map((k) => `${baseBranch}-${k}`)
  : [];

console.log(`Expanded unhashed key is: ${key}\n`);

cacheClient
  .restore(
    new RestoreRequest({
      keys: [...currentBranchKeys, ...baseBranchKeys],
    }),
  )
  .then((resp: RestoreResponse) => {
    if (resp.success) {
      console.log('Found cache entry on: ' + resp.key);
      rememberCacheRestorationForPostStep();
    } else {
      console.log(`Cache miss on:`);
      console.log(`- ${currentBranch}-${hashedKey}`);
      if (baseBranch && currentBranch !== baseBranch) {
        console.log(`- ${baseBranch}-${hashedKey}`);
      }
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('Cache restoration failed:', err);
    process.exit(1);
  });

function rememberCacheRestorationForPostStep() {
  try {
    const stepGroupId = process.env.NX_STEP_GROUP_ID
      ? process.env.NX_STEP_GROUP_ID.replace(/-/g, '_')
      : '';
    const envValue = `NX_CACHE_STEP_WAS_SUCCESSFUL_HIT_${stepGroupId}=true\n`;
    if (existsSync(process.env.NX_CLOUD_ENV)) {
      appendFileSync(process.env.NX_CLOUD_ENV, envValue);
    } else {
      writeFileSync(process.env.NX_CLOUD_ENV, envValue);
    }
  } catch (e) {
    console.log(e);
  }
}
