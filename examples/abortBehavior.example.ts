/**
 * abortBehavior 选项使用示例
 *
 * 展示如何使用 abortBehavior 选项来控制信号何时中止 AbortController
 */

import { AbortError } from "../src";
import { asyncSignal } from "../src/asyncSignal";

const signal = asyncSignal();

setTimeout(async () => {
    try {
        await signal();
    } catch (e) {
        console.log("e instanceof AbortError :", e instanceof AbortError);
    }
});

setTimeout(() => {
    signal.abort();
}, 10);

console.log("---");
