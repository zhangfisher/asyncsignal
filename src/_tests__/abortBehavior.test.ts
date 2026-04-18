import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("asyncSignal abortBehavior 选项测试", () => {
    describe("默认行为 (abortBehavior: 'all')", () => {
        test("resolve时应该调用abortController.abort()", async () => {
            const signal = asyncSignal({ abortAt: 'all' });
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
            const signal = asyncSignal({ abortAt: 'all' });
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

        test("reset时应该调用abortController.abort()", () => {
            const signal = asyncSignal({ abortAt: 'all' });
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            signal();
            signal.reset();

            expect(aborted).toBeTrue();
            expect(abortSignal?.aborted).toBeTrue();
        });
    });

    describe("abortBehavior: 'reject'", () => {
        test("resolve时不应该调用abortController.abort()", async () => {
            const signal = asyncSignal({ abortAt: 'reject' });
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            const promise = signal();
            setTimeout(() => signal.resolve("成功"));

            await promise;

            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });

        test("reject时应该调用abortController.abort()", async () => {
            const signal = asyncSignal({ abortAt: 'reject' });
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

        test("reset时不应该调用abortController.abort()", () => {
            const signal = asyncSignal({ abortAt: 'reject' });
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            signal();
            signal.reset();

            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });
    });

    describe("abortBehavior: 'resolve'", () => {
        test("resolve时应该调用abortController.abort()", async () => {
            const signal = asyncSignal({ abortAt: 'resolve' });
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

        test("reject时不应该调用abortController.abort()", async () => {
            const signal = asyncSignal({ abortAt: 'resolve' });
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

            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });

        test("reset时不应该调用abortController.abort()", () => {
            const signal = asyncSignal({ abortAt: 'resolve' });
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            signal();
            signal.reset();

            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });
    });

    describe("abortBehavior: 'none'", () => {
        test("resolve时不应该调用abortController.abort()", async () => {
            const signal = asyncSignal({ abortAt: 'none' });
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            const promise = signal();
            setTimeout(() => signal.resolve("成功"));

            await promise;

            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });

        test("reject时不应该调用abortController.abort()", async () => {
            const signal = asyncSignal({ abortAt: 'none' });
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

            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });

        test("reset时不应该调用abortController.abort()", () => {
            const signal = asyncSignal({ abortAt: 'none' });
            const abortSignal = signal.getAbortSignal();

            let aborted = false;
            abortSignal?.addEventListener("abort", () => {
                aborted = true;
            });

            signal();
            signal.reset();

            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });
    });

    describe("abortBehavior 与其他功能的集成", () => {
        test("abortBehavior: 'reject' 与约束条件一起使用", async () => {
            let condition = false;
            const signal = asyncSignal({ constraint: () => condition, abortAt: 'reject' });
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

            // 由于是resolve，不应该abort
            expect(aborted).toBeFalse();
            expect(abortSignal?.aborted).toBeFalse();
        });

        test("abortBehavior: 'resolve' 与自动重置一起使用", async () => {
            const signal = asyncSignal({ abortAt: 'resolve', autoReset: true });

            // 第一次使用
            const abortSignal1 = signal.getAbortSignal();
            let aborted1 = false;
            abortSignal1?.addEventListener("abort", () => {
                aborted1 = true;
            });

            let promise1 = signal();
            setTimeout(() => signal.resolve("第一次"));

            await promise1;

            // 第一次resolve应该abort
            expect(aborted1).toBeTrue();
            expect(abortSignal1?.aborted).toBeTrue();

            // 第二次使用 - 由于autoReset，signal()内部会先reset，所以需要在signal()之后重新获取abortSignal
            let promise2 = signal();
            const abortSignal2 = signal.getAbortSignal();

            let aborted2 = false;
            abortSignal2?.addEventListener("abort", () => {
                aborted2 = true;
            });

            setTimeout(() => signal.resolve("第二次"));

            await promise2;

            // 第二次resolve也应该abort
            expect(aborted2).toBeTrue();
            expect(abortSignal2?.aborted).toBeTrue();
        });

        test("destroy和abort操作不受abortBehavior影响", async () => {
            const testBehaviors: Array<'all' | 'reject' | 'resolve' | 'none'> = ['all', 'reject', 'resolve', 'none'];

            for (const behavior of testBehaviors) {
                // 测试 destroy
                const signal1 = asyncSignal({ abortAt: behavior });
                const abortSignal1 = signal1.getAbortSignal();

                let aborted1 = false;
                abortSignal1?.addEventListener("abort", () => {
                    aborted1 = true;
                });

                const promise1 = signal1();
                setTimeout(() => signal1.destroy());

                try {
                    await promise1;
                } catch (error) {
                    // 预期的 AbortError
                }

                // destroy 总是应该 abort
                expect(aborted1).toBeTrue();
                expect(abortSignal1?.aborted).toBeTrue();

                // 测试 abort
                const signal2 = asyncSignal({ abortAt: behavior });
                const abortSignal2 = signal2.getAbortSignal();

                let aborted2 = false;
                abortSignal2?.addEventListener("abort", () => {
                    aborted2 = true;
                });

                const promise2 = signal2();
                setTimeout(() => signal2.abort());

                try {
                    await promise2;
                } catch (error) {
                    // 预期的 AbortError
                }

                // abort 总是应该 abort
                expect(aborted2).toBeTrue();
                expect(abortSignal2?.aborted).toBeTrue();
            }
        });
    });

    describe("实际使用场景", () => {
        test("仅在错误时中止网络请求", async () => {
            // 模拟只在错误时需要中止网络请求的场景
            const signal = asyncSignal({ abortAt: 'reject' });
            const abortSignal = signal.getAbortSignal();

            let requestAborted = false;
            abortSignal?.addEventListener("abort", () => {
                requestAborted = true;
            });

            // 模拟成功情况 - 不应该中止请求
            const successPromise = signal();
            setTimeout(() => signal.resolve("成功"));
            await successPromise;

            expect(requestAborted).toBeFalse();

            // 模拟失败情况 - 应该中止请求
            const failPromise = signal();
            setTimeout(() => signal.reject(new Error("失败")));

            try {
                await failPromise;
            } catch (error) {
                expect(requestAborted).toBeTrue();
            }
        });

        test("成功时清理资源但失败时保留", async () => {
            // 模拟只在成功时需要清理资源的场景
            const signal = asyncSignal({ abortAt: 'resolve' });
            const abortSignal = signal.getAbortSignal();

            let resourceCleaned = false;
            abortSignal?.addEventListener("abort", () => {
                resourceCleaned = true;
            });

            // 成功情况 - 应该清理资源
            const successPromise = signal();
            setTimeout(() => signal.resolve("成功"));
            await successPromise;

            expect(resourceCleaned).toBeTrue();

            // 重置并测试失败情况
            signal.reset();
            resourceCleaned = false;

            const abortSignal2 = signal.getAbortSignal();
            abortSignal2?.addEventListener("abort", () => {
                resourceCleaned = true;
            });

            // 失败情况 - 不应该清理资源
            const failPromise = signal();
            setTimeout(() => signal.reject(new Error("失败")));

            try {
                await failPromise;
            } catch (error) {
                expect(resourceCleaned).toBeFalse();
            }
        });
    });
});
