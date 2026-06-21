import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("竞态条件简单测试", () => {
    test("测试reject后的状态", async () => {
        const signal = asyncSignal();
        const promise = signal();

        signal.reject(new Error("first"));

        try {
            await promise;
        } catch {}

        expect(signal.isRejected()).toBe(true);
    });

    test("测试连续reject的行为", async () => {
        const signal = asyncSignal();
        const promise = signal();

        signal.reject(new Error("first"));
        signal.reject(new Error("second"));

        try {
            await promise;
        } catch {}

        // 应该只有第一个生效
        expect(signal.error?.message).toBe("first");
    });
});
