export interface IAsyncSignal {
    (timeout?: number, returns?: any): Awaited<Promise<any>>;
    id: number;
    reset(): void;
    reject(e?: Error | string): void;
    resolve(result?: any): void;
    destroy(): void;
    isResolved(): boolean;
    isRejected(): boolean;
    isPending(): boolean;
    abort(): void;
    getAbortSignal: () => AbortSignal;
}

/**
 * Abort行为类型
 * - 'all': 默认，在resolve、reject、reset时都abort abortController
 * - 'reject': 仅在reject时abort abortController
 * - 'resolve': 仅在resolve时abort abortController
 * - 'none': 从不自动abort abortController
 */
export type AbortBehavior = 'all' | 'reject' | 'resolve' | 'none';

export type AsyncSignalOptions = {
    timeout?: number;
    autoReset?: boolean;
    abortBehavior?: AbortBehavior;
};
