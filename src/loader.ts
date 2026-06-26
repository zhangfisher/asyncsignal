/**
 *
 * 用于加载异步数据
 *
 *
 * const loader = new AsyncLoader((args)=>fetch(url,{
 *   signal:args.abortSignal
 * }),{
 *    timeout:100,
 *    cache:100,
 *    retry:2,
 *    retryDelay:100
 * })
 *
 *
 *  const data = await loader.get()
 *
 *  // 中止执行
 *  loader.abort()
 *
 *
 *
 */

import { asyncSignal } from "./asyncSignal";
import { IStoreage, MapStorage } from "./storeage";
import { AsyncSignalArgs, IAsyncSignal } from "./types";
import { getId, mergeAbortSignal } from "./utils";

export type AsyncLoaderOptions = {
    autostart?: boolean;
    /**
     * 当启用缓存时提供此值
     */
    cacheKey?: string;
    /**
     * 是否缓存
     *
     * - =0： 不缓存
     * - >0: 缓存有效期
     */
    cache?: number;
    abortSignal?: AbortSignal; //
    /**
     * 每次尝试的超时时间（毫秒），>0 时生效
     *
     * 超时视为一次失败：若配置了 retry 会继续重试，主动 abort 则不会重试。
     */
    timeout?: number;
    /**
     * 失败后的最大重试次数，默认 0（不重试）
     *
     * 如 retry=2 表示最多重试 2 次（总共最多 3 次尝试）。
     * 主动 abort（abort() 或外部 abortSignal 触发）不会重试；超时与业务错误会重试。
     */
    retry?: number;
    /**
     * 每次重试前的等待毫秒数，默认 0（立即重试）
     */
    retryDelay?: number;
    storeage?:IStoreage
};
/**
 * 缓存项基础结构
 */
export interface CacheItem<T> {
    value: T;
    timestamp: number;
}
export type AsyncLoaderArgs = { abortSignal: AbortSignal };
export type IAsyncLoader<T = any> = (args: AsyncLoaderArgs) => Promise<T>;

export class AsyncLoader<T = any> {
    options: AsyncLoaderOptions;
    loading: boolean = false;
    signal: IAsyncSignal<T>;
    // 重试等待定时器句柄，abort 时用于终止等待
    private _retryTimerId: any = 0;
    constructor(
        public loader: IAsyncLoader<T>,
        options?: AsyncLoaderOptions,
    ) {
        this.options = Object.assign(
            {
                autostart: true,
                cache: 0,
                retry: 0,
                retryDelay: 0,
                storage:MapStorage
            },
            options,
        );
        // cache 开启但未提供 cacheKey：自动生成实例级 key，便于 clear() 定位
        // 注意：不能复用 _useCache()，因为它本身要求 cacheKey 已存在（循环依赖）
        if (this.options.cache! > 0 && !this.options.cacheKey) {
            this.options.cacheKey = getId();
        }
        this.signal = asyncSignal<T>();
        if (this.options.autostart) this.load();
    }
    get storage(){
        return this.options.storeage!
    }
    load(): void {
        if (this.loading) return;

        // 信号已结束：先 reset，以便缓存命中 resolve 或重新加载能生效
        if (this.signal.isFulfilled() || this.signal.isRejected()) {
            this.signal.reset();
        }

        // 缓存命中短路：直接 resolve 缓存值，不调用底层 loader
        const cached = this._getCacheItem();
        if (cached) {
            this.signal.resolve(cached.value);
            return;
        }

        // 用户主动中止信号（贯穿所有重试，不含 per-attempt 超时）
        // 用于区分"主动中止"（不重试）与"超时/业务失败"（可重试）
        const userSignals: AbortSignal[] = [this.signal.getAbortSignal()];
        if (this.options.abortSignal) userSignals.push(this.options.abortSignal);
        const userAbortSignal = mergeAbortSignal(...userSignals)!;

        this.loading = true;
        this._executeLoad(userAbortSignal, 0);
    }
    /**
     * 执行单次加载尝试，失败时按 retry/retryDelay 重试。
     *
     * - 每次尝试拥有独立的 timeout（若配置）；
     * - 超时与业务错误计入可重试失败；
     * - 主动中止（userAbortSignal 已 abort）不重试。
     */
    private _executeLoad(userAbortSignal: AbortSignal, attempt: number): void {
        // 本次尝试的独立超时控制器
        let timeoutId: any = 0;
        let timeoutController: AbortController | null = null;
        if (this.options.timeout && this.options.timeout > 0) {
            timeoutController = new AbortController();
            timeoutId = setTimeout(() => timeoutController!.abort(), this.options.timeout);
        }

        // 传给底层 loader 的 signal = 用户主动中止 + 本次超时
        const loaderSignals: AbortSignal[] = [userAbortSignal];
        if (timeoutController) loaderSignals.push(timeoutController.signal);
        const args = { abortSignal: mergeAbortSignal(...loaderSignals)! } as AsyncLoaderArgs;

        this.loader(args)
            .then((result) => {
                if (timeoutId) clearTimeout(timeoutId);
                this._setCacheItem(result);
                // 先于 resolve 同步复位 loading，避免 await 续行早于清理导致防重入误判
                this.loading = false;
                this.signal.resolve(result);
            })
            .catch((e: any) => {
                if (timeoutId) clearTimeout(timeoutId);
                const maxRetry = this.options.retry ?? 0;
                // 还有重试机会且非主动中止：安排重试
                if (attempt < maxRetry && !userAbortSignal.aborted) {
                    this._retryTimerId = setTimeout(
                        () => {
                            this._retryTimerId = 0;
                            this._executeLoad(userAbortSignal, attempt + 1);
                        },
                        this.options.retryDelay ?? 0,
                    );
                } else {
                    // 重试耗尽 / 主动中止：signal.reject 幂等，重复调用安全
                    this.loading = false;
                    this.signal.reject(e);
                }
            });
    }
    private _useCache() {
        return this.options.cache! > 0 && this.options.cacheKey;
    }
    private _setCacheItem(data: T) {
        if (this._useCache()) {
            this.storage.set(this.options.cacheKey!, {
                value: data,
                timestamp: Date.now(),
            });
        }
    }
    private _getCacheItem(): CacheItem<T> | undefined {
        if (!this._useCache()) return undefined;
        const item = this.storage.get(this.options.cacheKey!);
        if (!item) return undefined;
        // 过期则删除并视为失效
        if (Date.now() - item.timestamp > this.options.cache!) {
            this.storage.delete(this.options.cacheKey!);
            return undefined;
        }
        return item;
    }
    /**
     * 获取加载结果
     *
     * - autostart=false 时首次调用会懒触发 load()；
     * - 启用的缓存已失效（过期）时，再次调用会自动重新加载；
     * - 上次加载失败（rejected）时，再次调用会自动重试。
     *
     * args 透传给底层 signal（timeout 为等待超时、abortSignal 为 per-call 中止），
     * 与 options.timeout（加载超时）语义不同，不可混用。
     */
    get(args?: AsyncSignalArgs): Promise<T> {
        // 未在加载中，且（尚未成功完成 或 启用的缓存已失效）时触发/重新触发加载
        const cacheStale = this._useCache() && !this._getCacheItem();
        if (!this.loading && (!this.signal.isFulfilled() || cacheStale)) {
            this.load();
        }
        return this.signal(args);
    }
    /**
     * 中止加载：借 signal.getAbortSignal() 链路穿透到底层请求
     *
     * 若正处于重试等待中，一并终止等待并复位 loading。
     */
    abort() {
        this.signal.abort();
        if (this._retryTimerId) {
            clearTimeout(this._retryTimerId);
            this._retryTimerId = 0;
            this.loading = false;
        }
    }
    /**
     * 清空当前实例的缓存项
     */
    clear() {
        if (this._useCache() && this.options.cacheKey) {
            this.storage.delete(this.options.cacheKey);
        }
    }
    /**
     * 清空所有缓存项
     */
    clearAll() {
        this.storage.clear();
    }
}
