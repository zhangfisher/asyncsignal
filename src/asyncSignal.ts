import { AsyncSignalOptions, IAsyncSignal } from "./types";
import { AbortError } from "./errors";

let AsyncSignalId = 0;
/**
 * 生成一个异步信号
 *
 * const signal = asyncSignal()
 * const signal = asyncSignal({timeout:10,until:()=>x==1})
 *
 * await  signal(timeout)
 * signal.resolve()
 * signal.reject()
 * signal.destroy()
 *
 * @param {AsyncSignalOptions} options
 *      - until: 当调用signal.resolve()时，还需要满足的前置条件，仅当until返回true时，signal才可以进行真正resolve
 *      - timeout: 超时时间
 *      - autoReset: 是否自动重置
 *      - abortAt: abort行为
 * @returns {function}
 */

export function asyncSignal<T = any, M extends Record<string, any> = Record<string, any>>(
    options?: AsyncSignalOptions,
): IAsyncSignal<T, M> {
    const { autoReset = false, abortAt = "all", until } = options || {};
    let isFulfilled: boolean = false,
        isRejected: boolean = false,
        isPending: boolean = true;
    let resolveSignal: Function,
        rejectSignal: Function,
        timeoutId: any = 0;
    let objPromise: Promise<any> | null;
    let signalId = ++AsyncSignalId;
    let abortController: AbortController | null = null;
    let resolveResult: T | undefined;
    let rejectError: any;
    let completionTimestamp = 0;
    let metadata = {} as M;

    // 辅助函数：根据abortAt决定是否应该abort
    const shouldAbort = (action: "resolve" | "reject" | "reset"): boolean => {
        switch (abortAt) {
            case "all":
                return true;
            case "resolve":
                return action === "resolve";
            case "reject":
                return action === "reject";
            case "none":
                return false;
            default:
                return true;
        }
    };

    // 重置信号，可以再次复用
    const reset = function () {
        clearTimeout(timeoutId);
        if (shouldAbort("reset") && abortController) abortController.abort();
        isFulfilled = false;
        isRejected = false;
        isPending = true;
        rejectError = undefined;
        resolveResult = undefined;
        completionTimestamp = 0;
        abortController = null;
        objPromise = new Promise((resolve, reject) => {
            resolveSignal = resolve;
            rejectSignal = reject;
        });
    };

    reset();

    async function signal(timeout: number = 0, returns?: any) {
        // 如果until返回的true，代表不需要等待
        if (typeof until === "function" && until()) {
            isFulfilled = true;
            return resolveResult;
        }

        // 如果信号上次已经完成了，则需要重置信号
        if (isFulfilled || isRejected) {
            if (autoReset) {
                reset();
            } else {
                if (isRejected) {
                    throw rejectError;
                } else {
                    return resolveResult;
                }
            }
        }
        // 指定超时功能
        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                // 添加状态检查，防止在已经处理的信号上重复操作
                if (!isPending || isFulfilled || isRejected) {
                    // 信号已经被其他操作处理，跳过超时处理
                    return;
                }

                // 状态锁：立即锁定状态
                const originalPending = isPending;
                isPending = false;

                try {
                    completionTimestamp = Date.now();
                    isFulfilled = true;

                    if (returns instanceof Error) {
                        rejectError = returns;
                        rejectSignal(returns);
                    } else {
                        resolveResult = returns;
                        resolveSignal(resolveResult);
                    }
                } catch {
                    // 出错时恢复原始状态
                    isPending = originalPending;
                    isFulfilled = false;
                }
            }, timeout);
        }
        return objPromise;
    }
    signal.id = signalId;
    signal.resolve = (result?: any) => {
        clearTimeout(timeoutId);

        // 快速路径：状态检查
        if (!isPending || isFulfilled || isRejected) {
            return;
        }

        // 状态锁：立即设置 isPending = false，防止其他并发操作
        // 保存原始状态以便在出错时恢复
        const originalPending = isPending;
        isPending = false; // 立即锁定状态

        let shouldFulfill: boolean = false;
        try {
            // 注意：是否真正resolve还受约束条件的约束，只有满足约束条件时才会真正resolve
            if (typeof until === "function") {
                if (until()) {
                    if (shouldAbort("resolve") && abortController) abortController.abort();
                    shouldFulfill = true;
                    completionTimestamp = Date.now();
                    resolveSignal(result);
                } else {
                    // 如果不满足约束条件，恢复原始状态
                    isPending = originalPending;
                    return;
                }
            } else {
                if (shouldAbort("resolve") && abortController) abortController.abort();
                shouldFulfill = true;
                completionTimestamp = Date.now();
                resolveSignal(result);
            }
        } catch (error) {
            // 出错时恢复原始状态
            isPending = originalPending;
            throw error;
        } finally {
            if (shouldFulfill) {
                resolveResult = result;
                rejectError = undefined;
                isFulfilled = true;
                isPending = false; // 确认最终状态
            }
        }
    };

    signal.reject = (e?: Error | string) => {
        clearTimeout(timeoutId);

        // 快速路径：状态检查
        if (!isPending || isFulfilled || isRejected) {
            return;
        }

        // 状态锁：立即设置 isPending = false，防止其他并发操作
        const originalPending = isPending;
        isPending = false; // 立即锁定状态

        try {
            const err = typeof e === "string" ? new Error(e) : e instanceof Error ? e : new Error();
            rejectError = err;
            completionTimestamp = Date.now();
            isRejected = true; // 立即设置状态
            if (shouldAbort("reject") && abortController) abortController.abort();
            rejectSignal(err);
        } catch (error) {
            // 出错时恢复原始状态
            isPending = originalPending;
            isRejected = false; // 恢复状态
            throw error;
        } finally {
            // 确认最终状态
            if (isRejected) {
                isPending = false; // 确认非pending状态
            } else if (!isFulfilled) {
                // 如果reject没有成功，恢复原始状态
                isPending = originalPending;
            }
        }
    };

    // 信号被销毁时，产生一个中止错误，信号的使用者可以据此进行善后处理
    signal.destroy = () => {
        try {
            clearTimeout(timeoutId);
            if (isPending) {
                setTimeout(() => {
                    try {
                        rejectSignal(new AbortError());
                    } catch {}
                });
                if (abortController) abortController.abort();
            }
            isFulfilled = false;
            isPending = false;
            isRejected = false;
            objPromise = null;
            abortController = null;
            resolveResult = undefined;
            rejectError = undefined;
            completionTimestamp = 0;
        } catch {}
    };

    signal.reset = reset;
    signal.isFulfilled = () => isFulfilled;
    signal.isRejected = () => isRejected;
    signal.isPending = () => isPending;

    // 暴露 result 和 error 属性
    Object.defineProperty(signal, "result", {
        get: () => resolveResult,
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(signal, "error", {
        get: () => rejectError,
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(signal, "timestamp", {
        get: () => completionTimestamp,
        enumerable: true,
        configurable: true,
    });

    Object.defineProperty(signal, "meta", {
        get: () => metadata,
        enumerable: true,
        configurable: true,
    });

    signal.abort = () => {
        clearTimeout(timeoutId);

        // 快速路径：状态检查
        if (!isPending || isFulfilled || isRejected) {
            return;
        }

        // 状态锁：立即设置 isPending = false，防止其他并发操作
        const originalPending = isPending;
        isPending = false; // 立即锁定状态

        try {
            if (abortController) abortController.abort();
            abortController = null;
            rejectError = new AbortError();
            resolveResult = undefined;
            completionTimestamp = Date.now();
            rejectSignal(rejectError);
        } catch (error) {
            // 出错时恢复原始状态
            isPending = originalPending;
            throw error;
        } finally {
            // 确保状态正确设置
            isRejected = true; // abort 被视为一种 reject
            isPending = false; // 确认最终状态
        }
    };
    /**
     * 获取中止信号，当 signalreject时，会自动中止
     */
    signal.getAbortSignal = () => {
        if (abortController === null) {
            abortController = new AbortController();
        }
        return abortController?.signal;
    };

    return signal as unknown as IAsyncSignal<T, M>;
}

/**
 *
 * 创建一个已经resolve的信号
 *
 */
asyncSignal.resolve = <T = any, M extends Record<string, any> = Record<string, any>>(
    result: any,
) => {
    const signal = asyncSignal<T, M>();
    signal.resolve(result);
    return signal;
};

/**
 *
 * 创建一个已经reject的信号
 *
 */
asyncSignal.reject = <T = any, M extends Record<string, any> = Record<string, any>>(
    error?: Error | string,
) => {
    const signal = asyncSignal<T, M>();

    // 首先调用 signal() 来初始化 Promise
    const promise = signal() as Promise<any>;
    // 立即捕获这个 Promise 以避免未捕获的 rejection
    promise.catch(() => {});

    // 然后调用 reject
    signal.reject(error);

    return signal;
};
