import { describe, test, expect } from "bun:test";
import { AbortError } from "../errors";
import { asyncSignal } from "../asyncSignal";

describe("asyncSignal abortSignal 选项测试", () => {
    describe("基本中止行为", () => {
        test("外部 abortSignal 中止时，等待中的 promise 应 reject AbortError", async () => {
            const external = new AbortController();
            const signal = asyncSignal({ abortSignal: external.signal });

            const promise = signal();
            external.abort();

            await expect(promise).rejects.toBeInstanceOf(AbortError);
        });

        test("外部 abortSignal 中止时，signal 应进入 rejected 状态", async () => {
            const external = new AbortController();
            const signal = asyncSignal({ abortSignal: external.signal });

            const promise = signal();
            external.abort();
            try {
                await promise;
            } catch {
                // 预期的 AbortError
            }

            expect(signal.isRejected()).toBeTrue();
            expect(signal.isFulfilled()).toBeFalse();
            expect(signal.isPending()).toBeFalse();
        });

        test("外部 abortSignal 中止时，signal.error 应为 AbortError", async () => {
            const external = new AbortController();
            const signal = asyncSignal({ abortSignal: external.signal });

            const promise = signal();
            external.abort();
            try {
                await promise;
            } catch {
                // 预期的 AbortError
            }

            expect(signal.error).toBeInstanceOf(AbortError);
        });
    });

    describe("链式中止（getAbortSignal）", () => {
        test("外部 abortSignal 中止时，内部 getAbortSignal 应联动中止", async () => {
            const external = new AbortController();
            const signal = asyncSignal({ abortSignal: external.signal });

            // 懒初始化：首次调用创建内部 AbortController
            const internal = signal.getAbortSignal();
            let internalAborted = false;
            internal.addEventListener("abort", () => {
                internalAborted = true;
            });

            const promise = signal();
            external.abort();
            try {
                await promise;
            } catch {
                // 预期的 AbortError
            }

            expect(internalAborted).toBeTrue();
            expect(internal.aborted).toBeTrue();
        });
    });

    describe("边界场景", () => {
        test("传入已中止的 abortSignal 时应忽略，signal 保持可用", async () => {
            const external = new AbortController();
            external.abort();

            const signal = asyncSignal({ abortSignal: external.signal });

            // 已中止信号被忽略：signal 不被联动 abort，仍处于 pending
            expect(signal.isPending()).toBeTrue();
            expect(signal.isRejected()).toBeFalse();
            expect(signal.error).toBeUndefined();

            // signal 仍可正常 resolve
            const promise = signal();
            setTimeout(() => signal.resolve("成功"));
            expect(await promise).toBe("成功");
            expect(signal.isFulfilled()).toBeTrue();
        });

        test("未提供 abortSignal 时，signal 行为不受影响", async () => {
            const signal = asyncSignal();
            const promise = signal();
            setTimeout(() => signal.resolve("成功"));
            expect(await promise).toBe("成功");
            expect(signal.isFulfilled()).toBeTrue();
        });

        test("提供 abortSignal 但未触发时，signal 可正常 resolve", async () => {
            const external = new AbortController();
            const signal = asyncSignal({ abortSignal: external.signal });
            const promise = signal();
            setTimeout(() => signal.resolve("成功"));
            expect(await promise).toBe("成功");
            expect(signal.isFulfilled()).toBeTrue();
            expect(external.signal.aborted).toBeFalse();
        });

        test("destroy 后外部 abortSignal 再次中止不应产生副作用", async () => {
            const external = new AbortController();
            const signal = asyncSignal({ abortSignal: external.signal });

            // 先建立等待者，捕获 destroy 在 isPending 时产生的 rejectSignal，
            // 避免成为 unhandled rejection
            const promise = signal();
            signal.destroy();
            try {
                await promise;
            } catch {
                // destroy 会对等待者抛出 AbortError
            }

            // destroy 已解绑监听器，外部 abort 不应抛错或改变 signal 状态
            expect(() => external.abort()).not.toThrow();
            expect(signal.isPending()).toBeFalse();
            expect(signal.isRejected()).toBeFalse();
        });
    });

    describe("实际使用场景", () => {
        test("多个 signal 共享同一 abortSignal 时各自独立联动", async () => {
            const external = new AbortController();
            const s1 = asyncSignal({ abortSignal: external.signal });
            const s2 = asyncSignal({ abortSignal: external.signal });

            const p1 = s1();
            const p2 = s2();
            external.abort();

            // signal() 为 async function，返回的是包装后的 promise，与内部 objPromise
            // 并非同一对象。用 Promise.all 同时为 p1/p2 附加 handler，避免逐个 await 时
            // 另一个包装 promise 被 abort 触发 reject 后被判定为 unhandled rejection
            await expect(Promise.all([p1, p2])).rejects.toBeInstanceOf(AbortError);

            expect(s1.isRejected()).toBeTrue();
            expect(s2.isRejected()).toBeTrue();
        });
    });

    describe("per-call abortSignal（signal 调用参数）", () => {
        test("signal({ abortSignal }) 传入的信号中止时联动 abort 当前 signal", async () => {
            const external = new AbortController();
            const signal = asyncSignal();

            const promise = signal({ abortSignal: external.signal });
            external.abort();

            await expect(promise).rejects.toBeInstanceOf(AbortError);
            expect(signal.isRejected()).toBeTrue();
            expect(signal.error).toBeInstanceOf(AbortError);
        });

        test("signal({ abortSignal }) 信号未触发时，signal 可正常 resolve", async () => {
            const external = new AbortController();
            const signal = asyncSignal();

            const promise = signal({ abortSignal: external.signal });
            setTimeout(() => signal.resolve("成功"));

            const result = await promise;
            expect(result).toBe("成功");
            expect(signal.isFulfilled()).toBeTrue();
            expect(external.signal.aborted).toBeFalse();
        });
    });
});
