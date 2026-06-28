export type SafeCallback = (...args: any[]) => any;
/**
 * 安全调用回调（支持单个或数组），忽略回调内部抛出的错误，避免影响加载主流程。
 *
 * - 传入数组时逐个并发调用，单个回调的错误（同步 throw 或 rejected Promise）不影响其他回调；
 * - 同步抛错与返回 rejected Promise 的错误均被忽略。
 */
export function safeCall(fn: SafeCallback | SafeCallback[] | undefined, ...args: any[]): void {
    if (!fn) return;
    const fns = Array.isArray(fn) ? fn : [fn];
    for (const cb of fns) {
        if (typeof cb !== "function") continue;
        try {
            const result = cb(...args);
            // 如果是 Promise，捕获其错误
            if (result && typeof result === "object" && typeof result.then === "function") {
                result.catch(() => {
                    // 异步回调错误被忽略
                });
            }
        } catch {
            // 同步回调错误被忽略
        }
    }
}
