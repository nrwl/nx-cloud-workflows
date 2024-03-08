import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';
import { RestoreRequest, RestoreResponse } from './generated_protos/cache_pb';
import { hashKey } from './hashing-utils';
import { appendFileSync, writeFileSync, existsSync } from 'fs';

export const cacheClient = createPromiseClient(
  CacheService,
  createConnectTransport({
    baseUrl: 'http://127.0.0.1:9000',
  }),
);

const currentBranch = process.env.NX_BRANCH;
const baseBranch = process.env.BASE_BRANCH;

if (!process.env.KEY) {
  throw new Error('No cache restore key provided.');
}
const key = `${hashKey(process.env.KEY)}`;
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
      console.log('Found cache entry under key: ' + resp.key);
      rememberCacheRestorationForPostStep();
    } else {
      console.log('Cache miss.');
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
