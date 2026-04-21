import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("asyncSignal.reject 静态方法测试", () => {
    test("应该创建已reject的信号", async () => {
        const signal = asyncSignal.reject("测试错误");
        expect(signal.isRejected()).toBeTrue();
        expect(signal.isPending()).toBeFalse();
        expect(signal.isFulfilled()).toBeFalse();
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal();
        } catch (e) {
            // 预期的错误
        }
    });

    test("应该能够捕获错误信息", async () => {
        const errorMessage = "发生错误";
        const signal = asyncSignal.reject(errorMessage);

        try {
            await signal();
            expect(false).toBeTrue(); // 不应该到达这里
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe(errorMessage);
        }
    });

    test("error属性应该包含错误信息", async () => {
        const errorMessage = "测试错误信息";
        const signal = asyncSignal.reject(errorMessage);
        expect(signal.error).toBeInstanceOf(Error);
        expect(signal.error?.message).toBe(errorMessage);
        expect(signal.result).toBeUndefined();
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal();
        } catch (e) {
            // 预期的错误
        }
    });

    test("应该支持Error对象作为参数", async () => {
        const originalError = new Error("原始错误");
        const signal = asyncSignal.reject(originalError);
        expect(signal.error).toBe(originalError);
        expect(signal.error?.message).toBe("原始错误");
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal();
        } catch (e) {
            // 预期的错误
        }
    });

    test("应该支持字符串作为错误信息", async () => {
        const errorMessage = "字符串错误";
        const signal = asyncSignal.reject(errorMessage);
        expect(signal.error).toBeInstanceOf(Error);
        expect(signal.error?.message).toBe(errorMessage);
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal();
        } catch (e) {
            // 预期的错误
        }
    });

    test("不带参数时应该创建默认错误", async () => {
        const signal = asyncSignal.reject();
        expect(signal.error).toBeInstanceOf(Error);
        expect(signal.error?.message).toBe("");
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal();
        } catch (e) {
            // 预期的错误
        }
    });

    test("多次调用signal()应该返回相同的错误", async () => {
        const errorMessage = "重复错误";
        const signal = asyncSignal.reject(errorMessage);

        for (let i = 0; i < 3; i++) {
            try {
                await signal();
                expect(false).toBeTrue(); // 不应该到达这里
            } catch (error) {
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toBe(errorMessage);
            }
        }
    });

    test("泛型类型推断应该正确", async () => {
        interface TestType {
            id: number;
            data: string;
        }
        const signal = asyncSignal.reject<TestType>("类型错误");
        expect(signal.error).toBeInstanceOf(Error);
        expect(signal.error?.message).toBe("类型错误");
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal();
        } catch (e) {
            // 预期的错误
        }
    });

    test("创建的信号应该有唯一ID", async () => {
        const signal1 = asyncSignal.reject("错误1");
        const signal2 = asyncSignal.reject("错误2");
        expect(signal1.id).toBeNumber();
        expect(signal2.id).toBeNumber();
        expect(signal1.id).not.toBe(signal2.id);
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal1();
            await signal2();
        } catch (e) {
            // 预期的错误
        }
    });

    test("手动调用已reject信号的reject方法不应该有影响", async () => {
        const signal = asyncSignal.reject("初始错误");
        expect(signal.isRejected()).toBeTrue();
        expect(signal.error?.message).toBe("初始错误");

        // 再次调用reject应该没有影响
        signal.reject("新错误");
        expect(signal.error?.message).toBe("初始错误");
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await signal();
        } catch (e) {
            // 预期的错误
        }
    });

    test("reset后应该可以重新使用", async () => {
        const signal = asyncSignal.reject("第一次错误");
        expect(signal.error?.message).toBe("第一次错误");

        signal.reset();
        expect(signal.error).toBeUndefined();
        expect(signal.result).toBeUndefined();
        expect(signal.isPending()).toBeTrue();

        const promise = signal();
        signal.reject("第二次错误");
        try {
            await promise;
        } catch (error) {
            expect((error as Error).message).toBe("第二次错误");
        }
        expect(signal.error?.message).toBe("第二次错误");
    });

    test("reset后可以resolve", async () => {
        const signal = asyncSignal.reject("初始错误");
        expect(signal.isRejected()).toBeTrue();

        signal.reset();
        expect(signal.isPending()).toBeTrue();

        const promise = signal();
        signal.resolve("成功");
        await promise;
        expect(signal.isFulfilled()).toBeTrue();
        expect(signal.result).toBe("成功");
    });

    test("与asyncSignal.resolve组合使用", async () => {
        const resolvedSignal = asyncSignal.resolve("成功结果");
        const rejectedSignal = asyncSignal.reject("失败原因");

        expect(resolvedSignal.isFulfilled()).toBeTrue();
        expect(resolvedSignal.result).toBe("成功结果");
        expect(rejectedSignal.isRejected()).toBeTrue();
        expect(rejectedSignal.error?.message).toBe("失败原因");
        // 捕获 Promise 以避免未捕获的 rejection
        try {
            await rejectedSignal();
        } catch (e) {
            // 预期的错误
        }
    });
});
