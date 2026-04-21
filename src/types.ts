export interface IAsyncSignal<T = any> {
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
}

export interface IAsyncSignalConstructor {
    <T = any>(options?: AsyncSignalOptions): IAsyncSignal<T>;
    resolve<T = any>(result: any): IAsyncSignal<T>;
    reject<T = any>(error?: Error | string): IAsyncSignal<T>;
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
