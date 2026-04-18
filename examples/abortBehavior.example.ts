/**
 * abortBehavior 选项使用示例
 *
 * 展示如何使用 abortBehavior 选项来控制信号何时中止 AbortController
 */

import { asyncSignal } from "../src/asyncSignal";

// 示例 1: 默认行为 (abortBehavior: 'all')
// 在 resolve、reject、reset 时都会 abort
console.log("示例 1: 默认行为");
const signal1 = asyncSignal({ abortAt: 'all' });
const abortSignal1 = signal1.getAbortSignal();

abortSignal1?.addEventListener("abort", () => {
    console.log("✓ AbortController 已被中止");
});

signal1();
signal1.resolve("成功");
console.log("");

// 示例 2: 仅在错误时中止 (abortBehavior: 'reject')
// 适用于只在错误时需要取消网络请求的场景
console.log("示例 2: 仅在错误时中止");
const signal2 = asyncSignal({ abortAt: 'reject' });
const abortSignal2 = signal2.getAbortSignal();

abortSignal2?.addEventListener("abort", () => {
    console.log("✓ 错误发生，AbortController 已被中止");
});

// 成功情况 - 不会 abort
signal2();
signal2.resolve("成功");
console.log("成功完成，没有中止 AbortController");

// 失败情况 - 会 abort
const signal2b = asyncSignal({ abortAt: 'reject' });
const abortSignal2b = signal2b.getAbortSignal();

abortSignal2b?.addEventListener("abort", () => {
    console.log("✓ 错误发生，AbortController 已被中止");
});

(async () => {
    const promise2b = signal2b();
    try {
        signal2b.reject(new Error("失败"));
        await promise2b;
    } catch (error) {
        // 预期的错误
    }
})();
console.log("");

// 示例 3: 仅在成功时中止 (abortBehavior: 'resolve')
// 适用于只在成功时需要清理资源的场景
console.log("示例 3: 仅在成功时中止");
const signal3 = asyncSignal({ abortAt: 'resolve' });
const abortSignal3 = signal3.getAbortSignal();

abortSignal3?.addEventListener("abort", () => {
    console.log("✓ 成功完成，AbortController 已被中止");
});

signal3();
signal3.resolve("成功");
console.log("");

// 示例 4: 从不自动中止 (abortBehavior: 'none')
// 适用于需要手动控制中止时机的场景
console.log("示例 4: 从不自动中止");
const signal4 = asyncSignal({ abortAt: 'none' });
const abortSignal4 = signal4.getAbortSignal();

abortSignal4?.addEventListener("abort", () => {
    console.log("✓ AbortController 已被中止");
});

signal4();
signal4.resolve("成功");
console.log("完成，但 AbortController 没有被自动中止");

// 可以手动 abort
const signal4b = asyncSignal({ abortAt: 'none' });
const abortSignal4b = signal4b.getAbortSignal();
abortSignal4b?.addEventListener("abort", () => {
    console.log("✓ 手动中止了 AbortController");
});
(async () => {
    const promise4b = signal4b();
    try {
        signal4b.abort();
        await promise4b;
    } catch (error) {
        // 预期的 AbortError
    }
})();
console.log("");

// 实际应用场景: 网络请求取消
console.log("实际应用: 网络请求取消");
async function fetchWithTimeout(url: string, timeout: number) {
    const signal = asyncSignal({ abortAt: 'reject' });
    const abortSignal = signal.getAbortSignal();

    try {
        const response = await Promise.race([
            fetch(url, { signal: abortSignal! }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("请求超时")), timeout)
            )
        ]);

        signal.resolve("请求成功");
        return response;
    } catch (error) {
        signal.reject(error as Error);
        throw error;
    }
}

// 模拟使用
console.log("发起网络请求（仅在错误时取消）");
// fetchWithTimeout("https://api.example.com", 5000)
//     .then(() => console.log("✓ 请求成功"))
//     .catch(() => console.log("✗ 请求失败或超时，已取消"));

console.log("\n所有示例完成！");
