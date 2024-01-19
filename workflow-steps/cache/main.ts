import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';
import { RestoreRequest, RestoreResponse } from './generated_protos/cache_pb';
import { hashKey } from './hashing-utils';

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
    if (resp.success) console.log('Found cache entry under key: ' + resp.key);
    else console.log('Cache miss.');
  });
