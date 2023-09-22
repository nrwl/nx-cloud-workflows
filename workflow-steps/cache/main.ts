import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';
import {
    RestoreRequest,
    RestoreResponse,
} from './generated_protos/cache_pb';

export const cacheClient = createPromiseClient(
    CacheService,
    createConnectTransport({
        baseUrl: 'http://127.0.0.1:9000',
    })
);

/*
  2. look at how github/azure allows you to configure their action
  1. get the keys in as an env var, separated by "|"
  2. create a file hasher, idenitfy files in there "yarn.lock" etc.
  3. go backwards through the keys list, and match on the first one that's found. That will allow us to use the cache from main for example, and still benefit from somewhat fast installs
  5. test on the ocean repo
  6. think about branch protection rules
  7. Move this outside of the repo
  8. have a storage limit per repository

      - name: Restore cached Primes
      uses: actions/cache/restore@v3
      with:
        path: |
          path/to/dependencies
          some/other/dependencies
        key: ${{ runner.os }}-primes
    .
    . //intermediate workflow steps
    .
    - name: Save Primes
      id: cache-primes-save
      uses: actions/cache/save@v3
      with:
        path: |
          path/to/dependencies
          some/other/dependencies
        key: ${{ steps.cache-primes-restore.outputs.cache-primary-key }}

Azure:
- task: Cache@2
  inputs:
    key: # string. Required. Key.
    path: # string. Required. Path.
    #cacheHitVar: # string. Cache hit variable.
    #restoreKeys: # string. Additional restore key prefixes.


 the way I'd declare this in the yaml would be:

 env:
  KEY: '"yarn" | {{nxBranch}} | yarn.lock | *.js'
  FALLBACK_KEYS: |
    {{nxBranch}}
  PATH:


this would get translated to:

KEY = "\"yarn\" | \"my-branch\" | yarn.lock | *.js"

for tomorrow:
- understand how the caching service works:
  does it accept multiple keys to restore because it does fallback restores? or is it one key per path to restore back?
    is that why it has multiple paths?
  store makes sense:
    define multiple paths to store, under a single key

- get minimum ready version:
  no extras: no thinking about what I'm going to save to (question from post step)
    no branch protection
    no file size upload limit
  always upload cache in the post action (unless I can think about quickly how to skip, maybe I can implement in the grpc service)
  no action outputs


 */

const key = process.env.KEY;
let primaryRestoreKeyParts;
if (key) {
    primaryRestoreKeyParts = key.split('|');
} else {
    throw new Error('No cache restore key provided.');
}
const fallbackKeys = process.env.FALLBACK_KEYS.split(',').map((v) => v.trim());
const path = process.env.RESTORE_PATH;

cacheClient
    .restore(
        new RestoreRequest({
            keys: [key, ...fallbackKeys],
            // keys: [hash('./yarn.lock') + '{{ currentBranch }}', 'main'],
            paths: ['node_modules_mock'],
        })
    )
    .then((resp: RestoreResponse) => {
        console.log('Cache hit found: ' + resp.success);
        console.log('Found under key: ' + resp.key);
    });

// https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows#restrictions-for-accessing-a-cache
