import { createPromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { CacheService } from './generated_protos/cache_connect';
import { StoreRequest, StoreResponse } from './generated_protos/cache_pb';
import { hashKey } from './hashing-utils';

const input_key = process.env.NX_CLOUD_INPUT_key;
const input_paths = process.env.NX_CLOUD_INPUT_paths;

const cacheWasHit =
  process.env[
    `NX_CACHE_STEP_WAS_SUCCESSFUL_HIT_${process.env.NX_STEP_GROUP_ID}`
  ] === 'true';
if (!!cacheWasHit) {
  console.log('Skipped storing to cache');
} else {
  const cacheClient = createPromiseClient(
    CacheService,
    createConnectTransport({
      baseUrl: 'http://127.0.0.1:9000',
    }),
  );

  if (!input_key || !input_paths) {
    throw new Error('No cache restore key or paths provided.');
  }
  const key = hashKey(input_key);
  const paths = input_paths.split('\n').filter((p) => p);

  cacheClient
    .store(
      new StoreRequest({
        key,
        paths,
      }),
    )
    .then((r: StoreResponse) => {
      if (r.success)
        console.log(`Successfully stored to cache under key ${key}`);
      if (r.skipped)
        console.log(
          'Skipped storing to cache, another instance has already started the upload',
        );
    });
}
