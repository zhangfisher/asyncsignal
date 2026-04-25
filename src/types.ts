export interface IAsyncSignal<T = any, M extends Record<string, any> = Record<string, any>> {
    (timeout?: number, returns?: T): Awaited<Promise<T>>;
    id: number;
    reset(): void;
    reject(e?: Error | string): void;
    resolve(result?: T): void;
    destroy(): void;
    isFulfilled(): boolean;
    isRejected(): boolean;
    isPending(): boolean;
    abort(): void;
    getAbortSignal: () => AbortSignal;
    /**
     * 异步信号的错误信息
     */
    error: any;
    /**
     * 异步信号的结果值
     */
    result: T | undefined;
    /**
     * 信号完成或被拒绝的时间戳
     * 如果信号还在等待中，则为 0
     */
    timestamp: number;
    /**
     * 额外的元数据存储
     * 可以用于存储与信号相关的任何自定义数据
     */
    meta: M;
}

export interface IAsyncSignalConstructor {
    <T = any, M extends Record<string, any> = Record<string, any>>(options?: AsyncSignalOptions): IAsyncSignal<T, M>;
    resolve<T = any, M extends Record<string, any> = Record<string, any>>(result: any): IAsyncSignal<T, M>;
    reject<T = any, M extends Record<string, any> = Record<string, any>>(error?: Error | string): IAsyncSignal<T, M>;
}

/**
 * Abort行为类型
 * - 'all': 默认，在resolve、reject、reset时都abort abortController
 * - 'reject': 仅在reject时abort abortController
 * - 'resolve': 仅在resolve时abort abortController
 * - 'none': 从不自动abort abortController
 */
export type AbortBehavior = "all" | "reject" | "resolve" | "none";

export type AsyncSignalOptions = {
    autoReset?: boolean;
    abortAt?: AbortBehavior;
    until?: () => boolean;
};
