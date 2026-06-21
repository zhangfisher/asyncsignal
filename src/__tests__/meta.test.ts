import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("meta 元数据功能测试", () => {
    test("初始状态下 meta 应该为空对象", () => {
        const signal = asyncSignal();
        expect(signal.meta).toEqual({});
        expect(Object.keys(signal.meta)).toHaveLength(0);
    });

    test("应该能够设置和获取元数据", () => {
        const signal = asyncSignal();
        signal.meta.userId = "12345";
        signal.meta.requestId = "abc-123";

        expect(signal.meta.userId).toBe("12345");
        expect(signal.meta.requestId).toBe("abc-123");
    });

    test("应该能够存储复杂对象", () => {
        const signal = asyncSignal();
        signal.meta.config = {
            timeout: 5000,
            retries: 3,
            headers: { "Content-Type": "application/json" }
        };

        expect(signal.meta.config).toEqual({
            timeout: 5000,
            retries: 3,
            headers: { "Content-Type": "application/json" }
        });
    });

    test("reset 后应该保留元数据", async () => {
        const signal = asyncSignal();
        signal.meta.traceId = "trace-123";
        signal.meta.attempts = 1;

        // 第一次使用
        signal.resolve("first");
        await signal();

        expect(signal.meta.traceId).toBe("trace-123");
        expect(signal.meta.attempts).toBe(1);

        // 重置信号
        signal.reset();

        // 元数据应该仍然存在
        expect(signal.meta.traceId).toBe("trace-123");
        expect(signal.meta.attempts).toBe(1);

        // 可以继续修改元数据
        signal.meta.attempts = 2;
        expect(signal.meta.attempts).toBe(2);
    });

    test("destroy 后应该保留元数据", async () => {
        const signal = asyncSignal();
        signal.meta.sessionId = "session-456";

        signal.resolve("success");
        await signal();

        expect(signal.meta.sessionId).toBe("session-456");

        signal.destroy();

        // 元数据应该仍然存在
        expect(signal.meta.sessionId).toBe("session-456");
    });

    test("asyncSignal.resolve 应该支持元数据", () => {
        const signal = asyncSignal.resolve("success");
        signal.meta.source = "static-method";
        signal.meta.priority = "high";

        expect(signal.meta.source).toBe("static-method");
        expect(signal.meta.priority).toBe("high");
    });

    test("asyncSignal.reject 应该支持元数据", () => {
        const signal = asyncSignal.reject("error");
        signal.meta.errorCode = "E500";
        signal.meta.retryable = true;

        expect(signal.meta.errorCode).toBe("E500");
        expect(signal.meta.retryable).toBe(true);
    });

    test("应该能够在信号生命周期中使用元数据追踪状态", async () => {
        const signal = asyncSignal();

        // 初始状态
        signal.meta.createdAt = Date.now();
        signal.meta.status = "pending";

        // 更新状态
        signal.resolve("success");
        await signal();
        signal.meta.status = "fulfilled";
        signal.meta.completedAt = signal.timestamp;

        expect(signal.meta.status).toBe("fulfilled");
        expect(signal.meta.completedAt).toBeGreaterThan(0);
        expect(signal.meta.createdAt).toBeLessThanOrEqual(signal.meta.completedAt);
    });

    test("多个信号应该有独立的元数据对象", () => {
        const signal1 = asyncSignal();
        const signal2 = asyncSignal();

        signal1.meta.id = "signal-1";
        signal2.meta.id = "signal-2";

        expect(signal1.meta.id).toBe("signal-1");
        expect(signal2.meta.id).toBe("signal-2");

        // 修改一个不应该影响另一个
        signal1.meta.data = { value: 1 };
        signal2.meta.data = { value: 2 };

        expect(signal1.meta.data.value).toBe(1);
        expect(signal2.meta.data.value).toBe(2);
    });

    test("应该能够存储函数和Symbol作为元数据", () => {
        const signal = asyncSignal();
        const callback = () => console.log("test");
        const symbol = Symbol("test");

        signal.meta.callback = callback;
        signal.meta.symbol = symbol;

        expect(signal.meta.callback).toBe(callback);
        expect(signal.meta.symbol).toBe(symbol);
    });

    test("应该能够存储数组作为元数据", () => {
        const signal = asyncSignal();
        signal.meta.tags = ["important", "urgent", "production"];
        signal.meta.timestamps = [1000, 2000, 3000];

        expect(Array.isArray(signal.meta.tags)).toBe(true);
        expect(signal.meta.tags).toHaveLength(3);
        expect(signal.meta.timestamps).toEqual([1000, 2000, 3000]);
    });

    test("元数据可以用于性能监控", async () => {
        const signal = asyncSignal();
        const startTime = Date.now();

        signal.meta.startTime = startTime;
        signal.meta.operation = "fetch-data";

        await new Promise((resolve) => setTimeout(resolve, 10));

        signal.resolve("data");
        await signal();

        signal.meta.endTime = signal.timestamp;
        signal.meta.duration = signal.meta.endTime - signal.meta.startTime;

        expect(signal.meta.duration).toBeGreaterThanOrEqual(10);
        expect(signal.meta.operation).toBe("fetch-data");
    });

    test("元数据可以用于错误追踪", async () => {
        const signal = asyncSignal();
        const promise = signal();

        signal.meta.attemptNumber = 1;
        signal.meta.lastError = null;

        try {
            signal.reject(new Error("Network error"));
            await promise;
        } catch (error) {
            signal.meta.lastError = error;
            signal.meta.failedAt = signal.timestamp;
        }

        expect(signal.meta.attemptNumber).toBe(1);
        expect(signal.meta.lastError).toBeInstanceOf(Error);
        expect(signal.meta.failedAt).toBeGreaterThan(0);
    });
});
