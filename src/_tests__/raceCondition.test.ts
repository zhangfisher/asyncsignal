import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("竞态条件修复验证", () => {
    test("快速连续调用resolve应该只生效一次", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 快速连续调用
        signal.resolve("first");
        signal.resolve("second");
        signal.resolve("third");

        const result = await promise;
        // 应该只有第一次调用生效
        expect(result).toBe("first");
        expect(signal.isFulfilled()).toBe(true);
        expect(signal.isRejected()).toBe(false);
    });

    test("快速连续调用reject应该只生效一次", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 快速连续调用
        signal.reject(new Error("first"));
        signal.reject(new Error("second"));
        signal.reject(new Error("third"));

        try {
            await promise;
            expect(false).toBeTrue(); // 不应该resolve
        } catch (error) {
            // 应该只有第一次调用生效
            expect((error as Error).message).toBe("first");
            expect(signal.isRejected()).toBe(true);
        }
    });

    test("同时调用resolve和reject应该只生效一个", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 同时调用resolve和reject
        signal.resolve("success");
        signal.reject(new Error("error"));

        // 应该只有一个生效
        const isFulfilled = signal.isFulfilled();
        const isRejected = signal.isRejected();

        expect(isFulfilled || isRejected).toBe(true);
        expect(isFulfilled && isRejected).toBe(false); // 不能同时为true
    });

    test("resolve后再次调用应该不生效", async () => {
        const signal = asyncSignal();
        const promise = signal();

        signal.resolve("first");
        await promise;

        expect(signal.isFulfilled()).toBe(true);
        expect(signal.result).toBe("first");

        // 再次调用应该不生效
        signal.resolve("second");
        expect(signal.result).toBe("first"); // 保持第一次的值
    });

    test("reject后再次调用应该不生效", async () => {
        const signal = asyncSignal();
        const promise = signal();

        signal.reject(new Error("first"));

        try {
            await promise;
        } catch (error) {
            expect((error as Error).message).toBe("first");
        }

        expect(signal.isRejected()).toBe(true);
        expect(signal.error?.message).toBe("first");

        // 再次调用应该不生效
        signal.reject(new Error("second"));
        expect(signal.error?.message).toBe("first"); // 保持第一次的值
    });

    test("多次调用abort应该只生效一次", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 多次调用abort
        signal.abort();
        signal.abort();
        signal.abort();

        try {
            await promise;
            expect(false).toBeTrue(); // 不应该成功
        } catch (error) {
            expect(signal.isRejected()).toBe(true);
            expect(signal.isPending()).toBe(false);
        }
    });

    test("并发resolve测试：大量并发调用", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 模拟大量并发调用
        const promises = [];
        for (let i = 0; i < 100; i++) {
            promises.push(Promise.resolve().then(() => signal.resolve(`call-${i}`)));
        }

        await Promise.all(promises);
        await promise;

        // 应该只有一个生效
        expect(signal.isFulfilled()).toBe(true);
        expect(signal.isRejected()).toBe(false);

        // 结果应该是100个调用中的一个
        const result = signal.result;
        expect(result).toMatch(/^call-\d+$/);
    });

    test("状态锁应该防止竞态条件", async () => {
        const signal = asyncSignal();
        const promise = signal();

        let resolveCallCount = 0;

        // 创建一个并发场景
        const operations = [];
        for (let i = 0; i < 10; i++) {
            operations.push(
                Promise.resolve().then(() => {
                    signal.resolve(`op-${i}`);
                    resolveCallCount++;
                })
            );
        }

        await Promise.all(operations);
        await promise;

        // 验证只有一个操作真正生效
        expect(signal.isFulfilled()).toBe(true);
        expect(signal.isRejected()).toBe(false);

        // resolveCallCount 应该是 10（所有调用都尝试了）
        expect(resolveCallCount).toBe(10);

        // 但结果只有一个
        const result = signal.result;
        expect(result).toMatch(/^op-\d+$/);
    });

    test("超时与手动resolve同时发生应该只生效一次", async () => {
        const signal = asyncSignal();
        const promise = signal(50); // 50ms超时

        // 在45ms时手动resolve
        setTimeout(() => signal.resolve("manual"), 45);

        try {
            const result = await promise;
            // 应该只有一个生效
            expect(signal.isFulfilled()).toBe(true);
            expect(signal.isRejected()).toBe(false);
            expect(signal.isPending()).toBe(false);
            // 结果应该是 "manual"
            expect(result).toBe("manual");
        } catch (error) {
            // 如果reject，也应该是只有一个生效
            expect(signal.isRejected()).toBe(true);
            expect(signal.isFulfilled()).toBe(false);
            expect(signal.isPending()).toBe(false);
        }
    });

    test("abort与resolve同时发生应该只生效一个", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 同时调用abort和resolve
        signal.abort();
        signal.resolve("success");

        try {
            await promise;
            expect(false).toBeTrue(); // 不应该resolve成功
        } catch (error) {
            // abort应该优先
            expect(signal.isRejected()).toBe(true);
            expect(signal.error).toBeInstanceOf(require("../errors").AbortError);
        }
    });

    test("abort与reject同时发生应该只生效一个", async () => {
        const signal = asyncSignal();
        const promise = signal();

        // 同时调用abort和reject
        signal.abort();
        signal.reject(new Error("custom error"));

        try {
            await promise;
            expect(false).toBeTrue(); // 不应该resolve成功
        } catch (error) {
            // abort应该优先（因为先调用）
            expect(signal.isRejected()).toBe(true);
            // AbortError 的优先级更高
            expect(signal.error).toBeInstanceOf(require("../errors").AbortError);
        }
    });
});
