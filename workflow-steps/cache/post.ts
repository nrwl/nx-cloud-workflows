import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';
import { StoreRequest, StoreResponse } from './generated_protos/cache_pb';
import { buildCachePaths, hashKey } from './hashing-utils';

const inputKey = process.env.NX_CLOUD_INPUT_key;
const inputPaths = process.env.NX_CLOUD_INPUT_paths;

const stepGroupId = process.env.NX_STEP_GROUP_ID
  ? process.env.NX_STEP_GROUP_ID.replace(/-/g, '_')
  : '';
const cacheWasHit =
  process.env[`NX_CACHE_STEP_WAS_SUCCESSFUL_HIT_${stepGroupId}`] === 'true';
if (!!cacheWasHit) {
  console.log('Skipped storing to cache');
} else {
  const cacheClient = createPromiseClient(
    CacheService,
    createConnectTransport({
      baseUrl: 'http://127.0.0.1:9000',
    }),
  );

  const paths = buildCachePaths(inputPaths);
  const stringifiedPaths = paths.join(',');
  const key = `${inputKey} | "${stringifiedPaths}"`;

  const hashedKey =
    process.env[`NX_CACHE_STEP_HASHED_KEY_${stepGroupId}`] || hashKey(key);

  console.log(`Expanded unhashed cache key is: ${key}`);
  console.log(
    `Hashed key that will be used for storage: ${process.env.NX_BRANCH}-${hashedKey}`,
  );
  console.log('\nDirectories marked for upload:\n' + paths.join('\n'));

  cacheClient
    .storeV2(
      new StoreRequest({
        key: hashedKey,
        paths,
      }),
    )
    .then((r: StoreResponse) => {
      if (r.success) console.log(`\nSuccessfully uploaded marked directories.`);
      if (r.skipped)
        console.log(
          '\nSkipped storing to cache, another instance has already started the upload.',
        );
      process.exit(0);
    })
    .catch((err) => {
      console.error('Cache upload failed:', err);
      process.exit(1);
    });
}
