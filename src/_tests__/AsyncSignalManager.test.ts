import { describe, test, expect, beforeEach } from "bun:test";
import { type IAsyncSignal } from "../types";
import { AsyncSignalManager } from "../manager";

describe("AsyncSignalManager 简化测试", () => {
    let manager: AsyncSignalManager;

    beforeEach(() => {
        manager = new AsyncSignalManager();
    });

    describe("初始化", () => {
        test("应该创建管理器实例", () => {
            expect(manager).toBeDefined();
            expect(manager.options).toBeDefined();
            expect(manager.options?.timeout).toBe(0);
        });

        test("应该能够自定义超时设置", () => {
            const customManager = new AsyncSignalManager({ timeout: 5000 });
            expect(customManager.options?.timeout).toBe(5000);
        });
    });

    describe("创建信号", () => {
        test("应该创建新的异步信号", () => {
            const signal = manager.create();
            expect(signal).toBeDefined();
            expect(signal.id).toBeNumber();
            expect(signal.id).toBeGreaterThan(0);
        });

        test("创建的信号应该在signals中", () => {
            const signal = manager.create();
            expect(manager.signals[signal.id]).toBe(signal);
        });

        test("应该创建多个独立的信号", () => {
            const signal1 = manager.create();
            const signal2 = manager.create();

            expect(signal1.id).not.toBe(signal2.id);
            expect(manager.signals[signal1.id]).toBe(signal1);
            expect(manager.signals[signal2.id]).toBe(signal2);
        });
    });

    describe("批量操作", () => {
        test("resolve应该resolve所有信号", async () => {
            const signal1 = manager.create();
            const signal2 = manager.create();

            const promise1 = signal1();
            const promise2 = signal2();

            manager.resolve();

            const result1 = await promise1;
            const result2 = await promise2;

            expect(signal1.isResolved()).toBeTrue();
            expect(signal2.isResolved()).toBeTrue();
        });

        test("reset应该reset所有信号", () => {
            const signal1 = manager.create();
            const signal2 = manager.create();

            signal1();
            signal2();
            signal1.resolve();
            signal2.resolve();

            expect(signal1.isResolved()).toBeTrue();
            expect(signal2.isResolved()).toBeTrue();

            manager.reset();

            expect(signal1.isResolved()).toBeFalse();
            expect(signal2.isResolved()).toBeFalse();
        });
    });

    describe("销毁操作", () => {
        test("destroy应该销毁所有信号", async () => {
            const signal1 = manager.create();
            const signal2 = manager.create();

            const promise1 = signal1();
            const promise2 = signal2();

            manager.destroy();

            const results = await Promise.allSettled([promise1, promise2]);

            expect(results.every(r => r.status === 'rejected')).toBeTrue();
            expect(manager.signals).toEqual({});
        });

        test("destroy(id)应该销毁指定信号", async () => {
            const signal1 = manager.create();
            const signal2 = manager.create();
            const signal3 = manager.create();

            const promise1 = signal1();

            manager.destroy(signal1.id);

            const result = await Promise.allSettled([promise1]);

            expect(result[0].status).toBe('rejected');
            expect(signal2.isPending()).toBeFalse(); // signal2未受影响
            expect(manager.signals[signal1.id]).toBeUndefined();
            expect(manager.signals[signal2.id]).toBeDefined();
        });

        test("destroy不存在的ID不应该报错", () => {
            expect(() => manager.destroy(99999)).not.toThrow();
            expect(() => manager.destroy([99999, 88888])).not.toThrow();
        });
    });

    describe("错误处理", () => {
        test("reject应该reject所有信号", async () => {
            const signal1 = manager.create();
            const signal2 = manager.create();

            const promise1 = signal1();
            const promise2 = signal2();

            manager.reject(new Error("批量拒绝"));

            const results = await Promise.allSettled([promise1, promise2]);

            expect(results.every(r => r.status === 'rejected')).toBeTrue();

            results.forEach(result => {
                if (result.status === 'rejected') {
                    expect(result.reason.message).toBe("批量拒绝");
                }
            });
        });
    });

    describe("状态管理", () => {
        test("signals应该正确反映当前管理的信号", () => {
            const signal1 = manager.create();
            const signal2 = manager.create();

            expect(Object.keys(manager.signals).length).toBe(2);

            manager.destroy(signal1.id);

            expect(Object.keys(manager.signals).length).toBe(1);
            expect(manager.signals[signal1.id]).toBeUndefined();
            expect(manager.signals[signal2.id]).toBeDefined();
        });
    });

    describe("实际使用场景", () => {
        test("管理多个并发操作", async () => {
            const results: string[] = [];
            const signal1 = manager.create();
            const signal2 = manager.create();
            const signal3 = manager.create();

            // 模拟并发操作
            const operation1 = async () => {
                await signal1();
                results.push("操作1");
            };

            const operation2 = async () => {
                await signal2();
                results.push("操作2");
            };

            const operation3 = async () => {
                await signal3();
                results.push("操作3");
            };

            // 启动所有操作
            const allOperations = Promise.all([
                operation1(),
                operation2(),
                operation3()
            ]);

            // 稍后一次性解决所有信号
            setTimeout(() => manager.resolve(), 50);

            await allOperations;

            expect(results.length).toBe(3);
        });
    });

    describe("边界情况", () => {
        test("空管理器的批量操作应该正常工作", () => {
            expect(() => manager.resolve()).not.toThrow();
            expect(() => manager.reject()).not.toThrow();
            expect(() => manager.reset()).not.toThrow();
            expect(() => manager.destroy()).not.toThrow();
        });

        test("连续创建和销毁信号", () => {
            for (let i = 0; i < 10; i++) {
                const signal = manager.create();
                expect(signal.id).toBeGreaterThan(0);
                manager.destroy(signal.id);
            }
            expect(Object.keys(manager.signals).length).toBe(0);
        });
    });
});
