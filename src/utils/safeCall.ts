/**
 * 安全调用回调，忽略回调内部抛出的错误，避免影响加载主流程
 */
export function safeCall(fn: ((...args: any[]) => void) | undefined, ...args: any[]): void {
    if (!fn) return;
    try {
        fn(...args);
    } catch {
        // 回调错误被忽略
    }
}
