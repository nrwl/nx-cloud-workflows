import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';

export const cacheClient = createPromiseClient(
    CacheService,
    createConnectTransport({
        baseUrl: 'http://127.0.0.1:9000',
    })
);

const keys = process.env.CACHE_KEYS;

console.log('mock running POST STORE');

/*
Question:
  I save on a main key, and I have fallback keys
  when I store, if there wasn't a hit, I can save on the same main key
  but what about the fallback keys?
    how will "main" work? it should store based on "nxbranch | yarn.lock" so it gets the latest dependencies
    but then do I save on all the fallback keys?

  or should it save on multiple keys?
 */

// cacheClient.store(
//   new StoreRequest({
//     key: 'main',
//     // keys: [hash('./yarn.lock') + '{{ currentBranch }}', 'main'],
//     paths: ['node_modules_mock'],
//   })
// );

// https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#restrictions-for-accessing-a-cache
