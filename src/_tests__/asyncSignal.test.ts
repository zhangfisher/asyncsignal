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

    describe("abortController.abort()调用验证", () => {
        test("resolve时应该调用abortController.abort()", async () => {
            const signal = asyncSignal();
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            const promise = signal();
            setTimeout(() => signal.resolve("成功"));

            await promise;

            expect(aborted).toBeTrue();
            expect(abortSignal?.aborted).toBeTrue();
        });

        test("reject时应该调用abortController.abort()", async () => {
            const signal = asyncSignal();
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            const promise = signal();
            setTimeout(() => signal.reject(new Error("失败")));

            try {
                await promise;
            } catch (error) {
                expect((error as Error).message).toBe("失败");
            }

            expect(aborted).toBeTrue();
            expect(abortSignal?.aborted).toBeTrue();
        });

        test("destroy时应该调用abortController.abort()", async () => {
            const signal = asyncSignal();
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            const promise = signal();
            setTimeout(() => signal.destroy());

            try {
                await promise;
            } catch (error) {
                expect(error).toBeInstanceOf(AbortError);
            }

            expect(aborted).toBeTrue();
            expect(abortSignal?.aborted).toBeTrue();
        });

        test("abort时应该调用abortController.abort()", async () => {
            const signal = asyncSignal();
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            const promise = signal();
            setTimeout(() => signal.abort());

            try {
                await promise;
            } catch (error) {
                expect(error).toBeInstanceOf(AbortError);
            }

            expect(aborted).toBeTrue();
            expect(abortSignal?.aborted).toBeTrue();
        });

        test("带约束条件的resolve也应该调用abortController.abort()", async () => {
            let condition = false;
            const signal = asyncSignal({ until: () => condition });
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            const promise = signal();

            // 设置条件为true并resolve
            setTimeout(() => {
                condition = true;
                signal.resolve("条件满足");
            });

            await promise;

            expect(aborted).toBeTrue();
            expect(abortSignal?.aborted).toBeTrue();
        });

        test("reset后重新使用时，新的resolve应该调用abortController.abort()", async () => {
            const signal = asyncSignal();

            // 第一次使用
            let abortSignal1 = signal.getAbortSignal();
            let aborted1 = false;
            abortSignal1?.addEventListener("abort", () => {
                aborted1 = true;
            });

            let promise1 = signal();
            setTimeout(() => signal.resolve("第一次"));
            await promise1;

            expect(aborted1).toBeTrue();
            expect(abortSignal1?.aborted).toBeTrue();

            // 重置
            signal.reset();

            // 第二次使用
            let abortSignal2 = signal.getAbortSignal();
            let aborted2 = false;
            abortSignal2?.addEventListener("abort", () => {
                aborted2 = true;
            });

            let promise2 = signal();
            setTimeout(() => signal.resolve("第二次"));
            await promise2;

            expect(aborted2).toBeTrue();
            expect(abortSignal2?.aborted).toBeTrue();
        });

        test("获取abortSignal后多次resolve应该只abort一次", async () => {
            const signal = asyncSignal();
            const abortSignal = signal.getAbortSignal();

            let abortCount = 0;
            abortSignal?.addEventListener("abort", () => {
                abortCount++;
            });

            const promise = signal();

            // 多次调用resolve
            setTimeout(() => {
                signal.resolve("第一次");
                signal.resolve("第二次");
                signal.resolve("第三次");
            });

            await promise;

            // abort事件应该只触发一次
            expect(abortCount).toBe(1);
            expect(abortSignal?.aborted).toBeTrue();
        });

        test("未获取abortSignal时resolve不应该报错", async () => {
            const signal = asyncSignal();

            // 不获取abortSignal
            const promise = signal();
            setTimeout(() => signal.resolve("成功"));

            // 应该正常完成，不应该报错
            const result = await promise;
            expect(result).toBe("成功");
        });

        test("不同操作序列下abortController.abort()都应该被调用", async () => {
            const testCases = [
                { name: "直接resolve", action: (s: any) => s.resolve("成功") },
                {
                    name: "超时后resolve",
                    action: (s: any) => setTimeout(() => s.resolve("成功"), 10),
                },
                { name: "带结果resolve", action: (s: any) => s.resolve({ data: "test" }) },
            ];

            for (const testCase of testCases) {
                const signal = asyncSignal();
                const abortSignal = signal.getAbortSignal();

                let aborted = false;
                abortSignal?.addEventListener("abort", () => {
                    aborted = true;
                });

                const promise = signal();
                testCase.action(signal);

                try {
                    await promise;
                    // 如果是reject的情况，捕获错误
                } catch (error) {
                    // 忽略预期的错误
                }

                expect(aborted).toBeTrue();
                expect(abortSignal?.aborted).toBeTrue();
            }
        });

        test("reset时应该abort已存在的abortController", () => {
            const signal = asyncSignal();
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            // 触发pending状态
            signal();

            // 调用reset
            signal.reset();

            // 应该触发abort
            expect(aborted).toBeTrue();
            expect(abortSignal?.aborted).toBeTrue();
        });

        test("reset后创建的新abortController应该是未aborted状态", () => {
            const signal = asyncSignal();

            // 第一次获取abortSignal并reset
            const abortSignal1 = signal.getAbortSignal();
            signal();
            signal.reset();

            expect(abortSignal1?.aborted).toBeTrue();

            // 第二次获取abortSignal
            const abortSignal2 = signal.getAbortSignal();

            // 新的abortSignal应该是未aborted状态
            expect(abortSignal2?.aborted).toBeFalse();
            expect(abortSignal1).not.toBe(abortSignal2);
        });

        test("reset未获取abortSignal时不应该报错", () => {
            const signal = asyncSignal();

            // 不获取abortSignal，直接reset
            expect(() => signal.reset()).not.toThrow();
            expect(() => signal.reset()).not.toThrow();
            expect(() => signal.reset()).not.toThrow();
        });

        test("reset多次调用不应该多次abort", () => {
            const signal = asyncSignal();
            const abortSignal = signal.getAbortSignal();

            let abortCount = 0;
            abortSignal?.addEventListener("abort", () => {
                abortCount++;
            });

            // 触发pending状态
            signal();

            // 多次调用reset
            signal.reset();
            signal.reset();
            signal.reset();

            // abort事件应该只触发一次
            expect(abortCount).toBe(1);
            expect(abortSignal?.aborted).toBeTrue();
        });
    });

    describe("result 和 error 属性测试", () => {
        test("resolve后应该可以通过result属性获取结果值", async () => {
            const signal = asyncSignal<string>();
            const promise = signal();
            const result = "成功结果";
            signal.resolve(result);
            await promise;

            expect(signal.result).toBe(result);
            expect(signal.error).toBeUndefined();
        });

        test("reject后应该可以通过error属性获取错误信息", async () => {
            const signal = asyncSignal<string>();
            const promise = signal();
            const error = new Error("测试错误");
            signal.reject(error);

            try {
                await promise;
            } catch (e) {
                // 预期的错误
            }

            expect(signal.result).toBeUndefined();
            expect(signal.error).toBe(error);
        });

        test("信号完成后多次await应该返回相同的result值", async () => {
            const signal = asyncSignal<string>();
            const promise = signal();
            const result = "测试结果";
            signal.resolve(result);
            await promise;

            // 多次获取 result
            expect(signal.result).toBe(result);
            expect(signal.result).toBe(result);
            expect(signal.result).toBe(result);
        });

        test("信号reject后多次await应该返回相同的error", async () => {
            const signal = asyncSignal<string>();
            const promise = signal();
            const error = new Error("重复错误");
            signal.reject(error);

            try {
                await promise;
            } catch (e) {
                // 预期的错误
            }

            // 多次获取 error
            expect(signal.error).toBe(error);
            expect(signal.error).toBe(error);
            expect(signal.error).toBe(error);
        });

        test("reset后应该清除result和error", async () => {
            const signal = asyncSignal<string>();
            const promise = signal();
            signal.resolve("第一次");
            await promise;

            expect(signal.result).toBe("第一次");
            expect(signal.error).toBeUndefined();

            signal.reset();

            expect(signal.result).toBeUndefined();
            expect(signal.error).toBeUndefined();
        });

        test("destroy后应该清除result和error", async () => {
            const signal = asyncSignal<string>();
            const promise = signal();
            signal.resolve("测试");
            await promise;

            expect(signal.result).toBe("测试");

            signal.destroy();

            expect(signal.result).toBeUndefined();
            expect(signal.error).toBeUndefined();
        });

        test("超时后应该通过result获取超时返回值", async () => {
            const signal = asyncSignal<string>();
            const timeoutResult = "超时结果";
            const result = await signal(50, timeoutResult);

            expect(result).toBe(timeoutResult);
            expect(signal.result).toBe(timeoutResult);
            expect(signal.error).toBeUndefined();
        });

        test("超时返回Error时应该通过error获取", async () => {
            const signal = asyncSignal<Error>();
            const timeoutError = new Error("超时错误");

            try {
                await signal(50, timeoutError);
            } catch (e) {
                // 预期的错误
            }

            expect(signal.result).toBeUndefined();
            expect(signal.error).toBe(timeoutError);
        });

        test("未完成时result和error应该为undefined", () => {
            const signal = asyncSignal<string>();

            expect(signal.result).toBeUndefined();
            expect(signal.error).toBeUndefined();
        });

        test("带约束条件的信号，约束不满足时result和error不应该改变", async () => {
            let condition = false;
            const signal = asyncSignal<string>({ until: () => condition });
            const promise = signal();

            // 尝试 resolve，但约束不满足
            signal.resolve("应该被阻塞");

            // 等待一小段时间确保异步操作完成
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(signal.result).toBeUndefined();
            expect(signal.error).toBeUndefined();

            // 满足约束条件
            condition = true;
            signal.resolve("现在可以resolve");
            await promise;

            expect(signal.result).toBe("现在可以resolve");
        });

        test("autoReset启用时，每次完成应该更新result", async () => {
            const signal = asyncSignal<string>({ autoReset: true });

            // 第一次完成
            let promise = signal();
            signal.resolve("第一次");
            await promise;
            expect(signal.result).toBe("第一次");

            // 第二次完成
            promise = signal();
            signal.resolve("第二次");
            await promise;
            expect(signal.result).toBe("第二次");
        });
    });
});
