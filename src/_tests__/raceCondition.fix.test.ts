// oxlint-disable typescript/no-floating-promises
import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("竞态条件修复验证", () => {
    test("过程和结果状态应该原子化设置", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 多次并发调用
        for (let i = 0; i < 10; i++) {
            Promise.resolve().then(() => signal.resolve(`call-${i}`));
        }

        const result = await promise;

        // 验证：只有一个生效
        expect(signal.isFulfilled()).toBe(true);
        expect(signal.isRejected()).toBe(false);
        expect(signal.isPending()).toBe(false);
        expect(result).toMatch(/^call-\d+$/);
    });

    test("until检查应该在锁外执行", async () => {
        let untilCallCount = 0;
        let shouldPass = false;

        const signal = asyncSignal({
            until: () => {
                untilCallCount++;
                // 模拟耗时操作（同步，不会被打断）
                const start = Date.now();
                while (Date.now() - start < 5);
                return shouldPass;
            },
        });

        const promise = signal(); // signal() 会调用一次 until

        // 第一次：until 返回 false
        signal.resolve("first");
        expect(signal.isPending()).toBe(true);
        expect(untilCallCount).toBeGreaterThanOrEqual(1); // signal() 调用了一次

        // 第二次：until 返回 true
        shouldPass = true;
        signal.resolve("second");

        const result = await promise;
        expect(result).toBe("second");
        expect(untilCallCount).toBeGreaterThanOrEqual(2);
    });

    test("并发resolve和reject应该只生效一个", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 同时调用 resolve 和 reject
        Promise.resolve().then(() => signal.resolve("success"));
        Promise.resolve().then(() => signal.reject(new Error("error")));

        try {
            const result = await promise;
            // 如果 resolve 成功
            expect(signal.isFulfilled()).toBe(true);
            expect(signal.isRejected()).toBe(false);
            expect(result).toBe("success");
        } catch (error) {
            // 如果 reject 成功
            expect(signal.isRejected()).toBe(true);
            expect(signal.isFulfilled()).toBe(false);
            expect((error as Error).message).toBe("error");
        }

        // 验证：只有一个状态为 true
        const stateCount = [signal.isPending(), signal.isFulfilled(), signal.isRejected()].filter(
            Boolean,
        ).length;

        expect(stateCount).toBe(1);
    });

    test("超时与手动操作应该只生效一个", async () => {
        const signal = asyncSignal();
        const promise = signal(100); // 100ms 超时

        // 在 50ms 时手动 resolve
        setTimeout(() => signal.resolve("manual"), 50);

        const result = await promise;

        // 验证：手动操作应该优先生效
        expect(result).toBe("manual");
        expect(signal.isFulfilled()).toBe(true);
        expect(signal.isRejected()).toBe(false);
    });

    test("状态不变量：过程结束时必须有结果", async () => {
        const signal = asyncSignal();

        // 初始状态
        expect(signal.isPending()).toBe(true);
        expect(signal.isFulfilled()).toBe(false);
        expect(signal.isRejected()).toBe(false);

        signal.resolve("success");

        // 最终状态
        expect(signal.isPending()).toBe(false);
        expect(signal.isFulfilled()).toBe(true);
        expect(signal.isRejected()).toBe(false);

        // 验证不变量：至少有一个状态为 true
        const hasAnyState = signal.isPending() || signal.isFulfilled() || signal.isRejected();
        expect(hasAnyState).toBe(true);

        // 验证不变量：不能同时成功和失败
        const hasBothResults = signal.isFulfilled() && signal.isRejected();
        expect(hasBothResults).toBe(false);
    });

    test("极端并发压力测试（1000次）", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 1000个并发 resolve 调用
        const promises = [];
        for (let i = 0; i < 1000; i++) {
            promises.push(Promise.resolve().then(() => signal.resolve(`call-${i}`)));
        }

        await Promise.all(promises);
        const result = await promise;

        // 验证：只有一个生效
        expect(signal.isFulfilled()).toBe(true);
        expect(result).toMatch(/^call-\d+$/);
    });

    test("abort与resolve同时发生应该只生效一个", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 同时调用
        Promise.resolve().then(() => signal.abort());
        Promise.resolve().then(() => signal.resolve("success"));

        try {
            await promise;
            expect(false).toBe(true); // 不应该到这里
        } catch {
            // abort 应该优先（或 resolve 优先，但只有一个生效）
            expect(signal.isRejected()).toBe(true);
            expect(signal.isFulfilled()).toBe(false);
        }
    });

    test("autoReset场景下的并发安全", async () => {
        const signal = asyncSignal({ autoReset: true });

        // 第一次使用
        signal.resolve("first");
        expect(signal.result).toBe("first");

        // 第二次使用（自动重置）
        const promise = signal();
        signal.resolve("second");
        const result = await promise;

        expect(result).toBe("second");
        expect(signal.isFulfilled()).toBe(true);
    });

    test("until返回false后应该能再次resolve", async () => {
        let callCount = 0;
        const signal = asyncSignal({
            until: () => {
                callCount++;
                return callCount >= 4; // 第四次才通过（signal() 调用一次）
            },
        });

        const promise = signal(); // 第一次调用 until

        // 第一次 resolve：until 返回 false
        signal.resolve("first");
        expect(signal.isPending()).toBe(true);
        expect(callCount).toBeGreaterThanOrEqual(2);

        // 第二次 resolve：until 返回 false
        signal.resolve("second");
        expect(signal.isPending()).toBe(true);
        expect(callCount).toBeGreaterThanOrEqual(3);

        // 第三次 resolve：until 返回 true
        signal.resolve("third");
        const result = await promise;

        expect(result).toBe("third");
        expect(callCount).toBeGreaterThanOrEqual(4);
        expect(signal.isFulfilled()).toBe(true);
    });

    test("并发reject应该只生效一次", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 多次并发 reject
        for (let i = 0; i < 10; i++) {
            Promise.resolve().then(() => signal.reject(new Error(`error-${i}`)));
        }

        try {
            await promise;
            expect(false).toBe(true); // 不应该成功
        } catch (error) {
            // 应该只有一个生效
            expect(signal.isRejected()).toBe(true);
            expect(signal.isFulfilled()).toBe(false);
            expect((error as Error).message).toMatch(/^error-\d+$/);
        }
    });

    test("until执行期间状态应该保持不变", async () => {
        let callCount = 0;

        const signal = asyncSignal({
            until: () => {
                callCount++;

                // 前两次返回 false，第三次及以后返回 true
                if (callCount >= 3) {
                    return true;
                }

                // 同步忙等待（模拟耗时操作）
                const start = Date.now();
                while (Date.now() - start < 10) {
                    // 忙等待
                }

                return false;
            },
        });

        const promise = signal(); // 第一次调用 until（返回 false）

        // 第一次 resolve：until 第二次调用，返回 false
        signal.resolve("first");

        // 验证：until 返回 false 后，状态仍然是 pending
        expect(signal.isPending()).toBe(true);

        // 第二次 resolve：until 第三次调用，返回 true
        signal.resolve("second");

        const result = await promise;
        expect(result).toBe("second");
        expect(signal.isFulfilled()).toBe(true);
    });

    test("转换锁应该防止状态转换中的干扰", async () => {
        const signal = asyncSignal();
        const promise = signal();

        let transitionDetected = false;

        // 尝试在转换过程中干扰
        const originalResolve = signal.resolve.bind(signal);
        signal.resolve = function (result?: any) {
            // 在 resolve 之后立即尝试 reject
            if (result === "first") {
                Promise.resolve().then(() => {
                    // @ts-ignore
                    if (signal.isTransitioning) {
                        transitionDetected = true;
                        signal.reject(new Error("interference"));
                    }
                });
            }
            return originalResolve(result);
        };

        signal.resolve("first");
        await promise;

        // 验证：第一个 resolve 成功，reject 被忽略
        expect(signal.isFulfilled()).toBe(true);
        expect(signal.isRejected()).toBe(false);
    });
});
