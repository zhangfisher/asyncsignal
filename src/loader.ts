/**
 *
 * 用于加载异步数据
 *
 *
 * const loader = new AsyncLoader((args)=>fetch(url,{
 *   signal:args.abortSignal
 * }),{
 *    timeout:100
 * })
 *
 *
 *  loader.signal
 *  const data = await loader.load()
 *
 *
 *
 *
 *
 *
 */

import { asyncSignal } from "./asyncSignal";
import { AsyncSignalOptions, IAsyncSignal } from "./types";

export type AsyncLoaderOptions = AsyncSignalOptions & {
    cache?: number; //
    abortSignal?: AbortSignal;
    timeout?: number; // 超时>0时代表超时
};

export type AsyncLoadArgs = { abortSignal: AbortSignal };
export type IAsyncLoad<T = any> = (args: AsyncLoadArgs) => Promise<T>;

export class AsyncLoader<T = any> {
    signal: IAsyncSignal;
    options: AsyncLoaderOptions;
    constructor(
        public loader: IAsyncLoad<T>,
        options?: AsyncLoaderOptions,
    ) {
        this.signal = asyncSignal(options);
        this.options = Object.assign({}, options);
    }
    load(): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const args = Object.assign({
                abortSignal: this.signal.getAbortSignal(),
            }) as AsyncLoadArgs;
            this.loader(args)
                .then((result) => {
                    resolve(result);
                })
                .catch((e: any) => {
                    reject(e);
                });
        });
    }
}
