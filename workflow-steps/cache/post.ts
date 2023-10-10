import {createPromiseClient} from '@bufbuild/connect';
import {createConnectTransport} from '@bufbuild/connect-web';
import {CacheService} from './generated_protos/cache_connect';
import {
    StoreRequest,
    StoreResponse,
} from './generated_protos/cache_pb';
import {hashKey} from "./hashing-utils";

export const cacheClient = createPromiseClient(
    CacheService,
    createConnectTransport({
        baseUrl: 'http://127.0.0.1:9000',
    })
);

if (!process.env.KEY || !process.env.PATHS) {
    throw new Error('No cache restore key or paths provided.');
}
const key = hashKey(process.env.KEY);
const paths = process.env.PATHS.split('\n').filter(p => p);

cacheClient.store(
    new StoreRequest({
        key,
        paths,
    })
).then((r: StoreResponse) => {
    console.log("Storing was successful: ", r.success);
    if (r.skipped) console.log("Skipped storing to cache, another instance has already started the upload");
});
