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
function defineSignalProperty(signal: any, name: string, getValue: () => any) {
    Object.defineProperty(signal, name, {
        get: getValue,
        enumerable: true,
        configurable: true,
    });
}

export function asyncSignal<T = any, M extends Record<string, any> = Record<string, any>>(
    options?: AsyncSignalOptions,
): IAsyncSignal<T, M> {
    const { autoReset = false, abortAt = "all", until } = options || {};
    // 状态变量
    let isFulfilled: boolean = false, // 结果状态：成功
        isRejected: boolean = false, // 结果状态：失败
        isPending: boolean = true; // 过程状态：正在进行

    // 状态转换锁，防止并发状态转换
    let isTransitioning: boolean = false;

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
        isTransitioning = false; // 重置转换锁
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
                // 原子化检查和锁获取
                if (isTransitioning || !isPending || isFulfilled || isRejected) {
                    // 已经被其他操作处理，跳过超时处理
                    return;
                }

                // 立即获取锁
                isTransitioning = true;

                // 原子化设置过程状态和结果状态
                isPending = false; // 结束过程

                if (returns instanceof Error) {
                    isRejected = true; // 失败结果
                    isFulfilled = false;
                } else {
                    isFulfilled = true; // 成功结果
                    isRejected = false;
                }

                try {
                    completionTimestamp = Date.now();

                    if (returns instanceof Error) {
                        rejectError = returns;
                        rejectSignal(returns);
                    } else {
                        resolveResult = returns;
                        resolveSignal(resolveResult);
                    }
                } catch (error) {
                    // 出错时不恢复状态
                    console.error("[asyncSignal] timeout handler error:", error);
                } finally {
                    // 释放锁
                    isTransitioning = false;
                }
            }, timeout);
        }
        return objPromise;
    }
    signal.id = signalId;
    signal.resolve = (result?: any) => {
        clearTimeout(timeoutId);

        // 第一步：在获取锁之前检查 until 条件
        // until 是同步函数，执行期间不会被其他代码打断
        if (typeof until === "function" && !until()) {
            return; // 不满足条件，直接返回，不改变任何状态
        }

        // 第二步：原子化检查和锁获取
        // JavaScript 单线程保证这个 if 判断是原子的
        if (isTransitioning || !isPending || isFulfilled || isRejected) {
            return; // 已经在转换中，或已完成，直接返回
        }

        // 第三步：立即获取锁
        isTransitioning = true;

        // 第四步：原子化设置过程状态和结果状态
        // 关键：同时设置，避免窗口期
        isPending = false; // 结束过程
        isFulfilled = true; // 设置成功结果
        isRejected = false; // 明确非失败

        try {
            // 执行副作用（状态已经一致设置，即使出错也不回滚）
            if (shouldAbort("resolve") && abortController) {
                abortController.abort();
            }

            // 更新结果和时间戳
            resolveResult = result;
            rejectError = undefined;
            completionTimestamp = Date.now();

            // 通知等待者
            resolveSignal(result);
        } catch (error) {
            // 关键决策：出错时不恢复状态
            // 理由：
            // 1. 过程状态和结果状态已经原子化设置
            // 2. Promise 已经 resolve，不能"un-resolve"
            // 3. 状态恢复会引入更复杂的竞态问题
            console.error("[asyncSignal] resolve error:", error);
            // 如果需要处理错误，应该通过其他机制（如事件）
        } finally {
            // 释放锁
            isTransitioning = false;
        }
    };

    signal.reject = (e?: Error | string) => {
        clearTimeout(timeoutId);

        // 原子化检查和锁获取
        if (isTransitioning || !isPending || isFulfilled || isRejected) {
            return; // 已经在转换中，或已完成，直接返回
        }

        // 立即获取锁
        isTransitioning = true;

        // 原子化设置过程状态和结果状态
        isPending = false; // 结束过程
        isFulfilled = false; // 明确非成功
        isRejected = true; // 设置失败结果

        try {
            // 执行副作用
            const err = typeof e === "string" ? new Error(e) : e instanceof Error ? e : new Error();
            rejectError = err;
            completionTimestamp = Date.now();

            if (shouldAbort("reject") && abortController) {
                abortController.abort();
            }

            // 通知等待者
            rejectSignal(err);
        } catch (error) {
            // 出错时不恢复状态
            console.error("[asyncSignal] reject error:", error);
        } finally {
            // 释放锁
            isTransitioning = false;
        }
    };

    // 信号被销毁时，产生一个中止错误，信号的使用者可以据此进行善后处理
    signal.destroy = () => {
        try {
            clearTimeout(timeoutId);

            if (isPending) {
                // 使用 setTimeout 确保异步执行
                setTimeout(() => {
                    try {
                        rejectSignal(new AbortError());
                    } catch {
                        // 忽略错误
                    }
                });

                if (abortController) {
                    abortController.abort();
                }
            }

            // 清理所有状态（包括锁）
            isFulfilled = false;
            isRejected = false;
            isPending = false; // destroy 后信号处于非活动状态
            isTransitioning = false;

            objPromise = null;
            abortController = null;
            resolveResult = undefined;
            rejectError = undefined;
            completionTimestamp = 0;
        } catch (error) {
            console.error("[asyncSignal] destroy error:", error);
        }
    };

    signal.reset = reset;
    signal.isFulfilled = () => isFulfilled;
    signal.isRejected = () => isRejected;
    signal.isPending = () => isPending;
    defineSignalProperty(signal, "result", () => resolveResult);
    defineSignalProperty(signal, "error", () => rejectError);
    defineSignalProperty(signal, "timestamp", () => completionTimestamp);
    defineSignalProperty(signal, "meta", () => metadata);

    signal.abort = () => {
        clearTimeout(timeoutId);

        // 原子化检查和锁获取
        if (isTransitioning || !isPending || isFulfilled || isRejected) {
            return; // 已经在转换中，或已完成，直接返回
        }

        // 立即获取锁
        isTransitioning = true;

        // 原子化设置过程状态和结果状态（abort 是一种 reject）
        isPending = false; // 结束过程
        isFulfilled = false; // 明确非成功
        isRejected = true; // 设置失败结果

        try {
            // 执行副作用
            if (abortController) {
                abortController.abort();
                abortController = null;
            }

            rejectError = new AbortError();
            resolveResult = undefined;
            completionTimestamp = Date.now();

            // 通知等待者
            rejectSignal(rejectError);
        } catch (error) {
            // 出错时不恢复状态
            console.error("[asyncSignal] abort error:", error);
        } finally {
            // 释放锁
            isTransitioning = false;
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
