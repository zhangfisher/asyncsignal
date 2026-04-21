import { describe, test, expect } from "bun:test";
import { AbortError } from "../errors";
import { asyncSignal } from "../asyncSignal";

describe("asyncSignal 基本功能测试", () => {
    test("应该创建具有唯一ID的信号", () => {
        const signal = asyncSignal();
        expect(signal.id).toBeNumber();
        expect(signal.id).toBeGreaterThan(0);
    });

    test("应该能够手动resolve信号", async () => {
        const signal = asyncSignal();
        const promise = signal();
        signal.resolve();
        await promise;
        expect(signal.isFulfilled()).toBeTrue();
    });

    test("resolve后应该返回结果", async () => {
        const signal = asyncSignal();
        const promise = signal();
        const result = "成功结果";
        signal.resolve(result);
        const resolved = await promise;
        expect(resolved).toBe(result);
    });

    test("应该在指定超时时间后resolve", async () => {
        const signal = asyncSignal();
        const result = await signal(50);
        expect(result).toBeUndefined();
    });

    test("超时后应该返回指定的值", async () => {
        const signal = asyncSignal();
        const result = await signal(50, "超时结果");
        expect(result).toBe("超时结果");
    });

    test("应该能够手动reject信号", async () => {
        const signal = asyncSignal();
        const promise = signal();
        signal.reject(new Error("测试错误"));
        try {
            await promise;
            expect(false).toBeTrue(); // 不应该到达这里
        } catch (error) {
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toBe("测试错误");
        }
    });

    test("reset后应该可以重新使用信号", async () => {
        const signal = asyncSignal();

        // 第一次使用
        let promise = signal();
        signal.resolve("第一次");
        const result1 = await promise;
        expect(result1).toBe("第一次");

        // 重置
        signal.reset();

        // 第二次使用
        promise = signal();
        signal.resolve("第二次");
        const result2 = await promise;
        expect(result2).toBe("第二次");
    });

    test("destroy应该reject等待中的promise", async () => {
        const signal = asyncSignal();
        const promise = signal();
        signal.destroy();

        try {
            await promise;
            expect(false).toBeTrue(); // 不应该到达这里
        } catch (error) {
            expect(error).toBeInstanceOf(AbortError);
        }
    });

    test("abort应该reject等待中的promise", async () => {
        const signal = asyncSignal();
        const promise = signal();
        signal.abort();

        try {
            await promise;
            expect(false).toBeTrue(); // 不应该到达这里
        } catch (error) {
            expect(error).toBeInstanceOf(AbortError);
        }
    });

    test("getAbortSignal应该在abort时中止", async () => {
        const signal = asyncSignal();
        const abortSignal = signal.getAbortSignal();
        expect(abortSignal).toBeInstanceOf(AbortSignal);

        let aborted = false;
        abortSignal?.addEventListener("abort", () => {
            aborted = true;
        });

        // 需要先触发pending状态
        const promise = signal();

        // 使用 nextTick 确保 abort 已经完成
        setTimeout(() => signal.abort());

        try {
            await promise;
        } catch (error) {
            // 预期的 AbortError
            expect(error).toBeInstanceOf(AbortError);
        }

        expect(aborted).toBeTrue();
    });

    test("手动resolve应该取消超时", async () => {
        const signal = asyncSignal();
        const promise = signal(1000);
        setTimeout(() => signal.resolve("手动"), 10);
        const result = await promise;
        expect(result).toBe("手动");
    });

    test("多次调用获取缓存值", async () => {
        const signal = asyncSignal();
        signal.resolve("test");
        expect(await signal()).toBe("test");
        expect(await signal()).toBe("test");
        expect(await signal()).toBe("test");
    });

    describe("asyncSignal.resolve 静态方法测试", () => {
        test("应该创建已resolve的信号", () => {
            const signal = asyncSignal.resolve("测试结果");
            expect(signal.isFulfilled()).toBeTrue();
            expect(signal.isPending()).toBeFalse();
            expect(signal.isRejected()).toBeFalse();
        });

        test("应该能够立即获取结果值而不需要等待", async () => {
            const result = "立即结果";
            const signal = asyncSignal.resolve(result);
            const promise = signal();
            const resolved = await promise;
            expect(resolved).toBe(result);
        });

        test("result属性应该包含正确的值", () => {
            const result = { data: "test", value: 123 };
            const signal = asyncSignal.resolve(result);
            expect(signal.result).toBe(result);
            expect(signal.error).toBeUndefined();
        });

        test("多次调用signal()应该返回相同的结果", async () => {
            const result = "重复结果";
            const signal = asyncSignal.resolve(result);
            expect(await signal()).toBe(result);
            expect(await signal()).toBe(result);
            expect(await signal()).toBe(result);
        });

        test("应该支持不同类型的值", async () => {
            // 字符串
            let signal = asyncSignal.resolve("字符串");
            expect(await signal()).toBe("字符串");
            expect(signal.result).toBe("字符串");

            // 数字
            signal = asyncSignal.resolve(42);
            expect(await signal()).toBe(42);
            expect(signal.result).toBe(42);

            // 对象
            const obj = { name: "test", value: 100 };
            signal = asyncSignal.resolve(obj);
            expect(await signal()).toBe(obj);
            expect(signal.result).toBe(obj);

            // null
            signal = asyncSignal.resolve(null);
            expect(await signal()).toBeNull();
            expect(signal.result).toBeNull();

            // undefined
            signal = asyncSignal.resolve(undefined);
            expect(await signal()).toBeUndefined();
            expect(signal.result).toBeUndefined();
        });

        test("泛型类型推断应该正确", () => {
            interface TestType {
                id: number;
                name: string;
            }
            const testData: TestType = { id: 1, name: "test" };
            const signal = asyncSignal.resolve<TestType>(testData);
            expect(signal.result).toBe(testData);
        });

        test("创建的信号应该有唯一ID", () => {
            const signal1 = asyncSignal.resolve("test1");
            const signal2 = asyncSignal.resolve("test2");
            expect(signal1.id).toBeNumber();
            expect(signal2.id).toBeNumber();
            expect(signal1.id).not.toBe(signal2.id);
        });

        test("手动调用已resolve信号的resolve方法不应该有影响", () => {
            const signal = asyncSignal.resolve("初始值");
            expect(signal.isFulfilled()).toBeTrue();
            expect(signal.result).toBe("初始值");

            // 再次调用resolve应该没有影响
            signal.resolve("新值");
            expect(signal.result).toBe("初始值");
        });

        test("reset后应该可以重新使用", async () => {
            const signal = asyncSignal.resolve("第一次");
            expect(signal.result).toBe("第一次");

            signal.reset();
            expect(signal.result).toBeUndefined();
            expect(signal.isPending()).toBeTrue();

            const promise = signal();
            signal.resolve("第二次");
            await promise;
            expect(signal.result).toBe("第二次");
        });
    });
});
