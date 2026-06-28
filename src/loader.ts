/// <reference lib="es2021.weakref" />
import { asyncSignal } from "./asyncSignal";
import { TimeoutError } from "./errors";
import { IStorage, MapStorage } from "./storage";
import { AsyncSignalArgs, IAsyncSignal } from "./types";
import { getFunctionHash, mergeAbortSignal, safeCall } from "./utils";

/**
 * AsyncLoader 构造选项
 *
 * @typeParam T 加载结果类型，用于 `onFulfilled` 回调 result 参数的类型
 */
export type AsyncLoaderOptions<T = any, M extends Record<string, any> = Record<string, any>> = {
    /**
     * 是否在构造时自动开始加载，默认 true。
     *
     * 设为 false 时改为懒加载：首次调用 `get()` 才触发加载。
     */
    autostart?: boolean;
    /**
     * 加载任务的唯一标识（hash），同时作为缓存键
     *
     * 若 `cache>0` 但未提供，将自动生成实例级 hash（便于 `clear()` 定位）。
     */
    hash?: string;
    /**
     * 是否缓存及其有效期（毫秒）
     *
     * - `=0`：不缓存（默认）
     * - `>0`：缓存有效期，过期后 `get()` 会自动重新加载
     */
    cache?: number;
    /**
     * 外部中止信号
     *
     * 触发中止时会联动中止加载，且不会触发重试（区别于超时）。
     */
    abortSignal?: AbortSignal;
    /**
     * 每次尝试的超时时间（毫秒），`>0` 时生效
     *
     * 超时视为一次失败：若配置了 `retry` 会继续重试，主动 abort 则不会重试。
     */
    timeout?: number;
    /**
     * 失败后的最大重试次数，默认 0（不重试）
     *
     * 如 `retry=2` 表示最多重试 2 次（总共最多 3 次尝试）。
     * 主动 abort（`abort()` 或外部 `abortSignal` 触发）不会重试；超时与业务错误会重试。
     */
    retry?: number;
    /**
     * 每次重试前的等待毫秒数，默认 0（立即重试）
     */
    retryDelay?: number;
    /**
     * 用于保存缓存数据
     */
    storage?: IStorage;
    /**
     * 复用加载（基于 hash 的实例复用）
     *
     * 对相同 hash 的加载器复用同一实例：构造时即登记到实例缓存表，
     * 加载结束（成功/失败/中止）后移除。autostart=false 的实例在首次 get 前以 pending 态登记，
     * 仍可被同 hash 的后续实例复用（l2 === l1，后续 get 共享一次加载）。
     *
     * - `"off"`：不启用，各实例相互独立
     * - `"restart"`：命中同 hash 且**正在进行中**的加载时，**中止该加载并以首个实例 loader 重新加载**（取消重启）
     * - `"share"`：命中同 hash 实例时**完全共享**，不中止（共享同一份加载与结果）
     *
     * restart 与 share 仅在「命中的实例正在进行中加载」时有区别；命中 pending 态或未命中时行为一致。
     * 复用时 loader 函数以首个实例为准，新 loader 传入的函数被忽略。
     *
     * 例：
     * - multiplex = "restart"
     *   ```ts
     *   const loader1 = new AsyncLoader(loaderFnA, { hash: "a", multiplex: "restart" })
     *   const loader2 = new AsyncLoader(loaderFnB, { hash: "a", multiplex: "restart" })
     *   // loader1 正在加载时构造 loader2：loader2 === loader1，
     *   // 先中止 loader1 的加载，再用 loader1 的 loaderFnA 重新加载（loaderFnB 被忽略）
     *   ```
     * - multiplex = "share"
     *   ```ts
     *   const loader1 = new AsyncLoader(loaderFnA, { hash: "a", multiplex: "share" })
     *   const loader2 = new AsyncLoader(loaderFnB, { hash: "a", multiplex: "share" })
     *   // loader2 === loader1，直接共享 loader1 进行中的加载，loaderFnB 被忽略
     *   ```
     *
     * 注意：
     * - multiplex !== "off" 且未提供 hash 时，基于 loader 函数自动生成 hash（`getFunctionHash`）；仅当不同 loader 发生 hash 碰撞时才需手动指定 hash
     * - 加载完成后实例缓存表移除该实例，再 new 同 hash 得到新实例（可命中 data cache）
     */
    multiplex?: "off" | "restart" | "share";
    /**
     * 加载出错时的兜底默认值
     *
     * loader 业务出错或超时（最终失败）时，若提供了 defaultValue（!== undefined），
     * 则吞掉错误、resolve 此默认值；**主动 abort 不生效**（仍 reject AbortError）。
     *
     * - 仅在重试耗尽（或无重试）的最终失败时触发，不影响重试流程；
     * - falsy 值（0/""/null/false）视为有效，只要显式提供即生效；
     * - 兜底值不写入 data cache（非真实结果，下次重新加载以获取真实值）。
     */
    defaultValue?: T;
    /**
     * 加载开始时调用（仅在实际发起加载时，缓存命中不触发）
     *
     * 与 `loading` 由 false 变 true 对齐；重试过程不重复触发。
     * 支持单个函数或函数数组，数组时逐个并发调用，任一回调抛错被忽略。
     */
    onPending?: (() => void) | (() => void)[];
    /**
     * 加载成功时调用（缓存命中不触发）
     *
     * `result` 为加载结果（含 `defaultValue` 兜底 resolve 的成功）。
     * 支持单个函数或函数数组，数组时逐个并发调用，任一回调抛错被忽略。
     */
    onFulfilled?: ((result: T) => void) | ((result: T) => void)[];
    /**
     * 加载失败/中止时调用（缓存命中不触发）
     *
     * 在最终失败（重试耗尽或主动 abort）时触发，`error` 为错误对象。
     * 支持单个函数或函数数组，数组时逐个并发调用，任一回调抛错被忽略。
     */
    onRejected?: ((error: Error) => void) | ((error: Error) => void)[];
    meta?: M;
};
/**
 * 缓存项结构
 */
export interface CacheItem<T> {
    /** 缓存的值 */
    value: T;
    /** 写入时间戳（毫秒），用于过期判断 */
    timestamp: number;
}
/**
 * 传给底层加载函数的参数
 */
export type AsyncLoaderArgs<M extends Record<string, any> = Record<string, any>> = {
    /** 合并后的中止信号（用户主动中止 + 本次尝试超时） */
    abortSignal: AbortSignal;
    meta: M;
};
/**
 * 底层加载函数类型
 *
 * - 通过 `args.abortSignal` 接收中止信号（可直接传入 `fetch` 的 `signal` 选项）；
 * - 通过 `args.meta` 读写加载过程中的元数据（如 fetch 的 `statusCode`），与 `loader.meta` 共享同一引用，写入即可在外部读取。
 *
 * 返回值可为 Promise 或同步值；同步 `throw` 与返回 rejected Promise 等价，
 * 均会进入既有的重试 / defaultValue / onRejected 错误处理链。
 *
 * @typeParam T 加载结果类型
 * @typeParam M 元数据类型
 */
export type IAsyncLoader<T = any, M extends Record<string, any> = Record<string, any>> = (
    args: AsyncLoaderArgs<M>,
) => Promise<T> | T;

/**
 * 基于 {@link IAsyncSignal} 的异步数据加载器
 *
 * 封装「加载 + 缓存 + 中止 + 超时 + 重试」五类能力：
 * - **加载**：通过 `get()` 获取结果，首次或缓存失效时自动触发；
 * - **缓存**：`cache>0` 时按 `hash` 缓存结果，过期自动重新加载；
 * - **中止**：`abort()` 借内部信号链路穿透到底层请求；
 * - **超时**：`timeout>0` 时为每次尝试设置独立超时，超时算作可重试的失败；
 * - **重试**：`retry>0` 时对超时/业务失败自动重试，主动 abort 不重试。
 *
 * @example
 * ```ts
 * const loader = new AsyncLoader(
 *     (args) => fetch(url, { signal: args.abortSignal }),
 *     {
 *         timeout: 100,        // 每次尝试的超时
 *         cache: 100,          // 缓存有效期(ms)
 *         hash: "req",     // 缓存键
 *         retry: 2,            // 失败后最多重试 2 次
 *         retryDelay: 100      // 每次重试前等待 100ms
 *     }
 * );
 *
 * const data = await loader.get(); // 获取结果（命中有效缓存则直接返回）
 * loader.abort();                  // 中止加载
 * loader.clear();                  // 清除当前实例缓存
 * ```
 *
 * @typeParam T 加载结果的类型
 * @see {@link AsyncLoaderOptions} 构造选项
 */
export class AsyncLoader<T = any, M extends Record<string, any> = Record<string, any>> {
    static seq: number = 0;
    /**
     * multiplex 实例缓存表（弱引用）
     * - key: 用户显式提供的 `hash`
     * - value: 该 hash 当前复用的 AsyncLoader 的 `WeakRef`（不阻止实例被 GC）
     *
     * 仅当 `multiplex>0` 且显式提供 hash 时启用：
     * - 由构造函数在创建新实例时登记（pending 态即登记，autostart=false 也参与复用）；
     * - 加载终态（成功 / 最终失败 / abort / 缓存命中短路）时移除；重试过程不移除（仍 inflight）。
     *
     * 弱引用语义：有外部强引用时 `_getLoader()` 解包返回实例并复用；无引用被 GC 后
     * `deref()` 返回 undefined，命中时懒清理并视为未命中——避免无引用实例（如 autostart=false 从不 get）驻留泄漏。
     */
    static loaderCache: Map<string, WeakRef<AsyncLoader<any>>> | undefined;
    /**
     * 从实例缓存表解包获取存活的 AsyncLoader 实例。
     *
     * 条目不存在或已被 GC（`WeakRef.deref()` 返回 undefined）时返回 undefined，并对死引用懒清理。
     */
    private static _getLoader(hash: string): AsyncLoader<any> | undefined {
        const cache = AsyncLoader.loaderCache;
        if (!cache) return undefined;
        const ref = cache.get(hash);
        if (!ref) return undefined;
        const loader = ref.deref();
        if (!loader) cache.delete(hash); // 死引用懒清理
        return loader;
    }
    /**
     * 清空 multiplex inflight 实例缓存表。
     *
     * 主要用于测试隔离：multiplex 测试的 beforeEach 应调用此方法，
     * 避免同 hash 跨用例复用 inflight 实例导致断言污染。业务代码通常无需调用。
     */
    static clearLoaderCache(): void {
        AsyncLoader.loaderCache?.clear();
    }
    /** 合并默认值后的构造选项 */
    options: AsyncLoaderOptions<T, M>;
    /** 是否正在加载（含重试过程），加载结束后复位为 false */
    loading: boolean = false;
    id: number = 0;
    /**
     * 内部承载结果的异步信号，可观察其 fulfilled/rejected/pending 状态及 result/error
     *
     * 用确定赋值断言：multiplex 命中分支会 `return` 已有实例（this 被丢弃，无需 signal），
     * 该路径在 signal 赋值之前退出；未命中分支在构造函数中正常赋值。
     */
    signal!: IAsyncSignal<T>;
    // 重试等待定时器句柄，abort 时用于终止等待
    private _retryTimerId: any = 0;
    /**
     * 加载周期令牌：每次 `load()` 递增，`_executeLoad` 的 then/catch 据此判断是否已被新一轮加载取代。
     *
     * 隔离被取代的旧加载回调——例如 mp=1 命中时 `abort()` 触发的旧 `.catch` 微任务，
     * 不应污染 `load()` 重新加载后的 loading / loaderCache / 回调状态。
     */
    private _loadToken: number = 0;
    /**
     * @param loader 底层加载函数，通过 `args.abortSignal` 接收合并后的中止信号（含超时与主动中止）
     * @param options 配置选项，见 {@link AsyncLoaderOptions}
     */
    constructor(
        public loader: IAsyncLoader<T, M>,
        options?: AsyncLoaderOptions<T, M>,
    ) {
        this.options = Object.assign(
            {
                autostart: true,
                cache: 0,
                retry: 0,
                retryDelay: 0,
                storage: MapStorage,
                multiplex: "off",
                meta: {},
            },
            options,
        );
        // hash：手动传入优先；否则基于 loader 函数生成（multiplex 复用 / cache 缓存共用同一确定性 key）
        // getId 是随机数、不适合作为 cache key；相同 loader → 相同 hash → data cache 亦可跨实例共享
        const mp = this.options.multiplex ?? "off";
        if ((mp !== "off" || this.options.cache! > 0) && !this.options.hash) {
            this.options.hash = getFunctionHash(this.loader);
        }

        // multiplex 命中拦截：必须在 this.signal 赋值之前 return，避免在被丢弃的 this 上创建孤儿 signal
        if (mp !== "off") {
            AsyncLoader.loaderCache ??= new Map();
            const existing = AsyncLoader._getLoader(this.options.hash!);
            if (existing) {
                // 命中：existing 可能 inflight(loading) 或 pending(autostart=false 未触发加载)
                if (existing.loading && this.options.multiplex === "restart") {
                    // restart 且进行中：中止重启（以首个实例 loader 为准）；pending 态无需中止
                    existing.clear(); // 清 data cache，防 reload 被缓存短路
                    existing.abort(); // 中止 inflight（同步复位 loading + 移除 loaderCache）
                    existing.load(); // reset signal + 重新加载（load 内重新登记到 loaderCache）
                }
                // mp=2，或 mp=1 但 existing 非 loading：复用现有实例，不操作
                return existing as unknown as this;
            }
            // 未命中：登记为当前 hash 的复用实例（pending/inflight 态均登记，供后续 new 复用）
            AsyncLoader.loaderCache.set(this.options.hash!, new WeakRef(this as AsyncLoader<any>));
        }
        this.id = ++AsyncLoader.seq;
        this.signal = asyncSignal<T>();
        if (this.options.autostart) this.load();
    }
    get storage() {
        return this.options.storage!;
    }
    get hash() {
        return this.options.hash;
    }
    /**
     * 加载过程的元数据：与底层加载函数的 `args.meta` 共享同一引用，
     * 加载函数写入的字段（如 fetch 的 statusCode）可在此直接读取。
     * 构造时由 `options.meta` 初始化（默认 `{}`）。
     */
    get meta(): M {
        return this.options.meta as M;
    }
    get error() {
        return this.signal.error;
    }
    get result() {
        return this.signal.result;
    }
    /**
     * 触发一次加载
     *
     * 执行流程：防重入 → 已结束信号先 reset → 缓存命中短路 → 构建 abort 链路 → 交给 `_executeLoad`。
     *
     * 通常无需手动调用：`get()` 会在首次、缓存失效或上次失败时自动触发。
     */
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
            this._removeFromLoaderCache(); // 同步完成，无 inflight 可共享，移除登记
            return;
        }

        // 用户主动中止信号（贯穿所有重试，不含 per-attempt 超时）
        // 用于区分"主动中止"（不重试）与"超时/业务失败"（可重试）
        const userSignals: AbortSignal[] = [this.signal.getAbortSignal()];
        if (this.options.abortSignal) userSignals.push(this.options.abortSignal);
        const userAbortSignal = mergeAbortSignal(...userSignals)!;

        // 实际加载开始（缓存命中路径已在上方 return，不会到达这里）
        // multiplex: 标记 inflight（仅显式 hash 启用），供同 hash 并发实例在加载完成前复用本实例
        if ((this.options.multiplex ?? "off") !== "off" && this.options.hash) {
            AsyncLoader.loaderCache ??= new Map();
            AsyncLoader.loaderCache.set(this.options.hash!, new WeakRef(this as AsyncLoader<any>));
        }
        safeCall(this.options.onPending);
        this.loading = true;
        this._loadToken++; // 新一轮加载周期，作废此前未完成的 _executeLoad 回调
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
        const token = this._loadToken; // 捕获本轮加载周期令牌
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
        const args: AsyncLoaderArgs<M> = {
            abortSignal: mergeAbortSignal(...loaderSignals)!,
            meta: this.meta, // 与 loader.meta 共享同一引用：加载函数写入的元数据外部可读
        };

        // 允许 loader 返回同步值或 Promise；同步 throw 经 Promise.reject 统一进入 catch
        let loaderResult: Promise<T> | T;
        try {
            loaderResult = this.loader(args);
        } catch (e) {
            loaderResult = Promise.reject(e);
        }
        Promise.resolve(loaderResult)
            .then((result) => {
                if (timeoutId) clearTimeout(timeoutId); // 先清理定时器，避免被取代的旧回调 return 跳过导致延迟释放
                if (token !== this._loadToken) return; // 已被新一轮 load 取代，忽略
                this._setCacheItem(result);
                // 先于 resolve 同步复位 loading，避免 await 续行早于清理导致防重入误判
                this.loading = false;
                this.signal.resolve(result);
                this._removeFromLoaderCache(); // 加载成功终态：移除 inflight 缓存
                safeCall(this.options.onFulfilled, result);
            })
            .catch((e: any) => {
                if (timeoutId) clearTimeout(timeoutId); // 先清理定时器，避免被取代的旧回调 return 跳过导致延迟释放
                if (token !== this._loadToken) return; // 已被新一轮 load 取代，忽略（含重试逻辑）
                const maxRetry = this.options.retry ?? 0;
                // 还有重试机会且非主动中止：安排重试
                if (attempt < maxRetry && !userAbortSignal.aborted) {
                    this._retryTimerId = setTimeout(() => {
                        this._retryTimerId = 0;
                        this._executeLoad(userAbortSignal, attempt + 1);
                    }, this.options.retryDelay ?? 0);
                } else {
                    // 超时（本次 timeoutController 已 abort）→ TimeoutError；
                    // 主动/外部 abort（不触碰 timeoutController）→ 透传 AbortError；
                    // 业务错误 → 透传原错误
                    const finalError = timeoutController?.signal.aborted ? new TimeoutError() : e;
                    this.loading = false;
                    // 主动中止（userAbortSignal.aborted）：defaultValue 不生效，保持 reject
                    // 超时/业务错误：提供 defaultValue 则吞错 resolve 默认值，否则 reject（原逻辑）
                    if (!userAbortSignal.aborted && this.options.defaultValue !== undefined) {
                        this.signal.resolve(this.options.defaultValue);
                        this._removeFromLoaderCache();
                        safeCall(this.options.onFulfilled, this.options.defaultValue);
                    } else {
                        this.signal.reject(finalError);
                        this._removeFromLoaderCache();
                        safeCall(this.options.onRejected, finalError);
                    }
                }
            });
    }
    /**
     * 加载终态时从 inflight 实例缓存表移除自身（幂等）
     *
     * 仅当缓存项仍指向当前实例时才删除，避免误删已被新实例替换的条目
     * （如 mp=1 命中时 abort 移除后 load 又重新写入同一实例）。
     */
    private _removeFromLoaderCache(): void {
        const cache = AsyncLoader.loaderCache;
        if (this.options.hash && cache?.get(this.options.hash)?.deref() === this) {
            cache.delete(this.options.hash);
        }
    }
    /** 是否启用了缓存（cache>0 且存在 hash） */
    private _useCache() {
        return this.options.cache! > 0 && this.options.hash;
    }
    /** 成功时写入缓存项（启用缓存时生效） */
    private _setCacheItem(data: T) {
        if (this._useCache()) {
            this.storage.set(this.options.hash!, {
                value: data,
                timestamp: Date.now(),
            });
        }
    }
    /**
     * 读取未过期的缓存项
     *
     * @returns 命中且未过期时返回缓存项；未启用缓存、不存在或已过期（自动删除）时返回 undefined
     */
    private _getCacheItem(): CacheItem<T> | undefined {
        if (!this._useCache()) return undefined;
        const item = this.storage.get(this.options.hash!);
        if (!item) return undefined;
        // 过期则删除并视为失效
        if (Date.now() - item.timestamp > this.options.cache!) {
            this.storage.delete(this.options.hash!);
            return undefined;
        }
        return item;
    }
    /**
     * 获取加载结果
     *
     * - `autostart=false` 时首次调用会懒触发 `load()`；
     * - 启用的缓存已失效（过期）时，再次调用会自动重新加载；
     * - 上次加载失败（rejected）时，再次调用会自动重试。
     *
     * `args` 透传给底层 signal（`timeout` 为等待超时、`abortSignal` 为 per-call 中止），
     * 与 `options.timeout`（加载超时）语义不同，不可混用。
     *
     * @param args 透传给内部 signal 的调用参数
     * @returns 加载结果（Promise）
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
     * 标记当前实例数据失效：清除缓存项并重置已完成的信号状态。
     *
     * - 不立即触发加载，下次 `get()` 会因信号未完成而重新加载；
     * - 正在加载中时仅清缓存（当前加载完成会写回，主要用于非加载态）；
     * - 与 {@link AsyncLoader.clear} 区别：`clear()` 仅删 data cache，`cache=0`（无缓存）时无效；
     *   `invalidate()` 额外 reset signal，**无缓存场景下也能保证下次 `get()` 重新加载**。
     */
    invalidate(): void {
        this.clear();
        // 仅在非加载且已结束时 reset：避免丢弃正在进行中的 pending awaiter
        if (!this.loading && (this.signal.isFulfilled() || this.signal.isRejected())) {
            this.signal.reset();
        }
    }
    /**
     * 强制重新加载并返回结果，忽略当前有效的缓存。
     *
     * - 若正在加载中，先中止当前 inflight 再重启（语义同 `multiplex="restart"`）；
     *   注意：此时其他并发 `get()` 的 awaiter 会收到 `AbortError`（与 restart 一致）。
     * - 清除 data cache 防止 `load()` 命中短路，确保真正发起底层请求；
     * - 返回 `Promise<T>`，调用方可 `await loader.refresh()` 拿到最新结果。
     *
     * @param args 透传给内部 signal（同 {@link AsyncLoader.get}）
     */
    refresh(args?: AsyncSignalArgs): Promise<T> {
        if (this.loading) {
            this.abort(); // 中止 inflight：同步复位 loading + reject 旧 signal
        }
        this.clear(); // 清 data cache，防 load() 缓存命中短路
        this.load(); // loading 已 false，必通过防重入；内部 reset signal + 重新加载
        return this.signal(args);
    }
    /**
     * 中止加载：借 `signal.getAbortSignal()` 链路穿透到底层请求
     *
     * 若正处于重试等待中，一并终止等待并复位 `loading`。
     * 主动中止不会触发重试。
     */
    abort() {
        this.signal.abort();
        // 同步复位 loading：覆盖"加载中 abort"场景
        // 原本靠 _executeLoad.catch 异步复位，会导致紧随其后的 load()（如 mp=1 命中重启）因 loading=true 被防重入拦截
        this.loading = false;
        // abort 是加载终态：从 inflight 缓存移除（_executeLoad.catch 微任务再调时幂等跳过）
        this._removeFromLoaderCache();
        // 若处于重试等待中：终止等待并触发结束回调
        // （加载中的 abort 由 _executeLoad 的 catch 触发 onRejected，此处补重试等待场景）
        if (this._retryTimerId) {
            clearTimeout(this._retryTimerId);
            this._retryTimerId = 0;
            safeCall(this.options.onRejected, this.signal.error);
        }
    }
    /**
     * 清空当前实例的缓存项（按构造时确定的 `hash`）
     */
    clear() {
        if (this._useCache() && this.options.hash) {
            this.storage.delete(this.options.hash);
        }
    }
    /**
     * 清空所有实例共享的全部缓存项
     */
    clearAll() {
        this.storage.clear();
    }
    /**
     * 是否正在加载中（含重试过程）。加载结束（成功 / 失败 / abort / 命中缓存）后为 false。
     *
     * 以权威的 `loading` 字段为准，而非 `signal.isPending()`：signal 的 pending 态在
     * "从未加载"或"invalidate 后 reset"时也为 true，但实际并未在加载。
     */
    isPending() {
        return this.loading;
    }
    /**
     * 加载是否成功（含 defaultValue 兜底 resolve 的成功）
     */
    isFulfilled() {
        return this.signal.isFulfilled();
    }
    /**
     * 加载是否出错（业务错误 / 超时 / abort）
     */
    isRejected() {
        return this.signal.isRejected();
    }
}
