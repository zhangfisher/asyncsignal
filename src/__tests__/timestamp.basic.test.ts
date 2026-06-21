import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("timestamp 基础测试", () => {
    test("初始状态下 timestamp 应该为 0", () => {
        const signal = asyncSignal();
        expect(signal.timestamp).toBe(0);
    });

    test("resolve 后 timestamp 应该被设置", async () => {
        const signal = asyncSignal();
        signal.resolve("success");
        await signal();
        expect(signal.timestamp).toBeGreaterThan(0);
    });

    test("reject 后 timestamp 应该被设置", async () => {
        const signal = asyncSignal();
        const promise = signal();
        signal.reject(new Error("error"));
        try {
            await promise;
        } catch (e) {}
        expect(signal.timestamp).toBeGreaterThan(0);
    });

    test("reset 后 timestamp 应该重置为 0", async () => {
        const signal = asyncSignal();
        signal.resolve("success");
        await signal();
        expect(signal.timestamp).toBeGreaterThan(0);
        signal.reset();
        expect(signal.timestamp).toBe(0);
    });

    test("asyncSignal.resolve 应该设置 timestamp", () => {
        const signal = asyncSignal.resolve("success");
        expect(signal.timestamp).toBeGreaterThan(0);
    });

    test("asyncSignal.reject 应该设置 timestamp", () => {
        const signal = asyncSignal.reject("error");
        expect(signal.timestamp).toBeGreaterThan(0);
    });
});
