export function mergeAbortSignal(...signals: AbortSignal[]): AbortSignal | undefined {
    // 如果传入的信号数量为 0，返回一个永远不会中止的信号
    if (signals.length === 0) {
        return;
    }

    // 如果只有一个信号，直接返回该信号
    if (signals.length === 1) {
        return signals[0];
    }

    // 检查是否已有信号被中止，若存在则直接返回该信号（保留其 abort reason）
    for (const signal of signals) {
        if (signal.aborted) {
            return signal;
        }
    }

    // 优先使用原生 AbortSignal.any（ES2024+），不支持时降级到手动合并
    if (typeof AbortSignal.any === "function") {
        return AbortSignal.any(signals);
    }

    return mergeAbortSignalsFallback(signals);
}

/**
 * 手动合并多个 AbortSignal 的降级方案
 *
 * 当运行环境不支持 AbortSignal.any 时使用：任一信号中止即触发合并信号中止。
 */
function mergeAbortSignalsFallback(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    // 任一信号中止时触发合并信号中止，并清理所有监听器
    const abortHandler = () => {
        controller.abort();
        for (const signal of signals) {
            signal.removeEventListener("abort", abortHandler);
        }
    };

    // 为所有信号绑定 abort 事件
    for (const signal of signals) {
        signal.addEventListener("abort", abortHandler);
    }

    return controller.signal;
}
