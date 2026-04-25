import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("竞态条件简单测试", () => {
    test("测试reject后的状态", async () => {
        const signal = asyncSignal();
        const promise = signal();

        signal.reject(new Error("first"));

        try {
            await promise;
        } catch (error) {
            console.log("Error caught:", (error as Error).message);
            console.log("isRejected:", signal.isRejected());
            console.log("isPending:", signal.isPending());
            console.log("isFulfilled:", signal.isFulfilled());
        }

        expect(signal.isRejected()).toBe(true);
    });

    test("测试连续reject的行为", async () => {
        const signal = asyncSignal();
        const promise = signal();

        signal.reject(new Error("first"));
        signal.reject(new Error("second"));

        try {
            await promise;
        } catch (error) {
            console.log("Caught error:", (error as Error).message);
            console.log("isRejected:", signal.isRejected());
            console.log("error message:", signal.error?.message);
        }

        // 应该只有第一个生效
        expect(signal.error?.message).toBe("first");
    });
});
