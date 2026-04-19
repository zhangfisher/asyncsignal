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

export function asyncSignal<T = any>(options?: AsyncSignalOptions): IAsyncSignal<T> {
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
                isFulfilled = true;
                try {
                    if (returns instanceof Error) {
                        rejectError = returns;
                        rejectSignal(returns);
                    } else {
                        resolveResult = returns;
                        resolveSignal(resolveResult);
                    }
                } catch {}
            }, timeout);
        }
        return objPromise;
    }
    signal.id = signalId;
    signal.resolve = (result?: any) => {
        clearTimeout(timeoutId);
        if (!isPending) return;
        if (isFulfilled || isRejected) return;
        let shouldFulfill: boolean = false;
        try {
            // 注意：是否真正resolve还受约束条件的约束，只有满足约束条件时才会真正resolve
            if (typeof until === "function") {
                if (until()) {
                    if (shouldAbort("resolve") && abortController) abortController.abort();
                    shouldFulfill = true;
                    resolveSignal(result);
                } else {
                    // 如果不满足约束条件，则静默返回，可以通过signal.isFulfilled()来判断是否完成
                    return;
                }
            } else {
                if (shouldAbort("resolve") && abortController) abortController.abort();
                shouldFulfill = true;
                resolveSignal(result);
            }
        } finally {
            if (shouldFulfill) {
                resolveResult = result;
                rejectError = undefined;
                isFulfilled = true;
                isPending = false;
            }
        }
    };

    signal.reject = (e?: Error | string) => {
        clearTimeout(timeoutId);
        if (!isPending) return;
        if (isFulfilled || isRejected) return;
        try {
            const err = typeof e === "string" ? new Error(e) : e instanceof Error ? e : new Error();
            rejectError = err;
            if (shouldAbort("reject") && abortController) abortController.abort();
            rejectSignal(err);
        } finally {
            resolveResult = undefined;
            isRejected = true;
            isPending = false;
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

    signal.abort = () => {
        clearTimeout(timeoutId);
        if (isPending) {
            if (abortController) abortController.abort();
            abortController = null;
            rejectError = new AbortError();
            resolveResult = undefined;
            isPending = false;
            rejectSignal(rejectError);
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

    return signal as unknown as IAsyncSignal;
}
