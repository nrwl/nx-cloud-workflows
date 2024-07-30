import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';
import { RestoreRequest, RestoreResponse } from './generated_protos/cache_pb';
import { hashKey } from './hashing-utils';
import { appendFileSync, writeFileSync, existsSync } from 'fs';

const input_key = process.env.NX_CLOUD_INPUT_key;
const input_base_branch = process.env.NX_CLOUD_INPUT_base_branch;

export const cacheClient = createPromiseClient(
  CacheService,
  createConnectTransport({
    baseUrl: 'http://127.0.0.1:9000',
  }),
);

const currentBranch = process.env.NX_BRANCH;
const baseBranch = input_base_branch;

if (!input_key) {
  throw new Error('No cache restore key provided.');
}
const key = `${hashKey(input_key)}`;
const currentBranchKeys = [key].map((k) => `${currentBranch}-${k}`);
const baseBranchKeys = baseBranch ? [key].map((k) => `${baseBranch}-${k}`) : [];

cacheClient
  .restore(
    new RestoreRequest({
      keys: [...currentBranchKeys, ...baseBranchKeys],
    }),
  )
  .then((resp: RestoreResponse) => {
    if (resp.success) {
      console.log('Found cache entry on hashed key: ' + resp.key);
      rememberCacheRestorationForPostStep();
    } else {
      console.log('Cache miss on hashed key: ' + key);
    }
  });

function rememberCacheRestorationForPostStep() {
  try {
    const envValue = `NX_CACHE_STEP_WAS_SUCCESSFUL_HIT_${process.env.NX_STEP_GROUP_ID}=true\n`;
    if (existsSync(process.env.NX_CLOUD_ENV)) {
      appendFileSync(process.env.NX_CLOUD_ENV, envValue);
    } else {
      writeFileSync(process.env.NX_CLOUD_ENV, envValue);
    }
  } catch (e) {
    console.log(e);
  }
}
