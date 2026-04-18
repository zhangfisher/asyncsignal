import { AsyncSignalOptions, IAsyncSignal } from "./types";
import { AbortError } from "./errors";

let AsyncSignalId = 0;
/**
 * 生成一个异步信号
 *
 * const signal = asyncSignal()
 * const signal = asyncSignal({timeout:10,constraint:()=>x==1})
 *
 * await  signal(timeout)
 * signal.resolve()
 * signal.reject()
 * signal.destroy()
 *
 * @param {AsyncSignalOptions} options
 *      - constraint: 当调用signal.resolve()时，还需要满足额外的约束条件，仅当constraint返回true，则signal才可以进行真正resolve
 *      - timeout: 超时时间
 *      - autoReset: 是否自动重置
 *      - abortAt: abort行为
 * @returns {function}
 */

export function asyncSignal(options?: AsyncSignalOptions): IAsyncSignal {
    const { autoReset = false, abortAt = "all", constraint } = options || {};
    let isResolved: boolean = false,
        isRejected: boolean = false,
        isPending: boolean = false;
    let resolveSignal: Function,
        rejectSignal: Function,
        timeoutId: any = 0;
    let objPromise: Promise<any> | null;
    let signalId = ++AsyncSignalId;
    let abortController: AbortController | null = null;

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
        isResolved = false;
        isRejected = false;
        isPending = false;
        abortController = null;
        objPromise = new Promise((resolve, reject) => {
            resolveSignal = resolve;
            rejectSignal = reject;
        });
    };

    reset();

    async function signal(timeout: number = 0, returns?: any) {
        // 如果constraint返回的true，代表不需要等待
        if (typeof constraint === "function" && constraint()) {
            isResolved = true;
            return;
        }

        // 如果信号上次已经完成了，则需要重置信号
        if (isResolved || isRejected) {
            if (autoReset) {
                reset();
            } else {
                return objPromise;
            }
        }
        isPending = true;
        // 指定超时功能
        if (timeout > 0) {
            timeoutId = setTimeout(() => {
                isResolved = true;
                try {
                    if (returns instanceof Error) {
                        rejectSignal(returns);
                    } else {
                        resolveSignal(returns);
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
        if (isResolved || isRejected) return;
        // 注意：是否真正resolve还受约束条件的约束，只有满足约束条件时才会真正resolve
        if (typeof constraint === "function") {
            if (constraint()) {
                if (shouldAbort("resolve") && abortController) abortController.abort();
                resolveSignal(result);
            } else {
                // 如果不满足约束条件，则静默返回，可以通过signal.isFulfilled()来判断是否完成
                return;
            }
        } else {
            if (shouldAbort("resolve") && abortController) abortController.abort();
            resolveSignal(result);
        }
        isResolved = true;
    };

    signal.reject = (e?: Error | string) => {
        clearTimeout(timeoutId);
        if (!isPending) return;
        if (isResolved || isRejected) return;
        const err = typeof e === "string" ? new Error(e) : e instanceof Error ? e : new Error();
        rejectSignal(err);
        if (shouldAbort("reject") && abortController) abortController.abort();
        isRejected = true;
    };

    // 信号被销毁时，产生一个中止错误，信号的使用者可以据此进行善后处理
    signal.destroy = () => {
        clearTimeout(timeoutId);
        if (isPending) {
            rejectSignal(new AbortError());
            if (abortController) abortController.abort();
        }
        isResolved = false;
        isPending = false;
        isRejected = false;
        objPromise = null;
    };

    signal.reset = reset;
    signal.isResolved = () => isResolved;
    signal.isRejected = () => isRejected;
    signal.isPending = () => isPending;

    signal.abort = () => {
        clearTimeout(timeoutId);
        if (isPending) {
            if (abortController) abortController.abort();
            abortController = null;
            rejectSignal(new AbortError());
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
