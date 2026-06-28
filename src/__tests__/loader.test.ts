import { describe, test, expect, beforeEach } from "bun:test";
import { AbortError, TimeoutError } from "../errors";
import { AsyncLoader, AsyncLoaderArgs } from "../loader";
import { MapStorage } from "../storage";

/**
 * 构造一个可中止的 loader：返回在 delay 后 resolve(value) 的 Promise，
 * 监听 args.abortSignal，被中止时 reject(AbortError)，模拟 fetch 行为。
 */
function createLoader<T>(value: T, delay = 0) {
    let calls = 0;
    const fn = (args: AsyncLoaderArgs) => {
        calls++;
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => resolve(value), delay);
            args.abortSignal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new AbortError());
            });
        });
    };
    return { fn, getCalls: () => calls };
}

/**
 * 构造一个前 failTimes 次失败、之后成功的 loader，用于重试测试。
 */
function createFailingLoader(failTimes: number, value: string, delay = 0) {
    let calls = 0;
    const fn = (args: AsyncLoaderArgs) => {
        calls++;
        return new Promise<string>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (calls <= failTimes) reject(new Error(`fail#${calls}`));
                else resolve(value);
            }, delay);
            args.abortSignal.addEventListener("abort", () => {
                clearTimeout(timer);
                reject(new AbortError());
            });
        });
    };
    return { fn, getCalls: () => calls };
}

/**
 * 构造一个永不自然完成、仅在被中止时 reject 的 loader，用于超时重试测试。
 */
function createTimeoutLoader() {
    let calls = 0;
    const fn = (args: AsyncLoaderArgs) => {
        calls++;
        return new Promise<string>((_resolve, reject) => {
            args.abortSignal.addEventListener("abort", () => reject(new AbortError()));
        });
    };
    return { fn, getCalls: () => calls };
}

/**
 * 构造一个返回同步值的 loader（即 IAsyncLoader 的 `Promise<T> | T` 中的 T 分支），
 * 用于验证同步加载成功路径。
 */
function createSyncLoader<T>(value: T) {
    let calls = 0;
    const fn = (_args: AsyncLoaderArgs) => {
        calls++;
        return value; // 同步返回
    };
    return { fn, getCalls: () => calls };
}

/**
 * 构造一个前 failTimes 次同步抛错、之后返回同步值的 loader，
 * 用于验证同步 throw 与异步 rejection 走同一错误处理链。
 */
function createSyncFailingLoader(failTimes: number, value: string) {
    let calls = 0;
    const fn = (_args: AsyncLoaderArgs) => {
        calls++;
        if (calls <= failTimes) throw new Error(`sync-fail#${calls}`); // 同步抛错
        return value;
    };
    return { fn, getCalls: () => calls };
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("AsyncLoader 基本加载", () => {
    test("autostart 默认 true，构造即开始加载", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn);
        expect(getCalls()).toBe(1); // 构造时已调用 load
        expect(loader.loading).toBeTrue();
        const result = await loader.get();
        expect(result).toBe("data");
        expect(loader.signal.isFulfilled()).toBeTrue();
    });

    test("autostart=false 时构造不加载，get() 懒触发", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        expect(getCalls()).toBe(0);
        expect(loader.signal.isPending()).toBeTrue();
        expect(loader.loading).toBeFalse();
        const result = await loader.get();
        expect(result).toBe("data");
        expect(getCalls()).toBe(1);
        expect(loader.signal.isFulfilled()).toBeTrue();
    });

    test("返回结果保持泛型类型", async () => {
        const loader = new AsyncLoader<{ id: number }>(() => Promise.resolve({ id: 42 }), {
            autostart: false,
        });
        const result = await loader.get();
        expect(result.id).toBe(42);
    });
});

describe("AsyncLoader 中止", () => {
    test("abort() 中止加载，get() reject AbortError", async () => {
        const { fn } = createLoader("data", 1000);
        const loader = new AsyncLoader(fn, { autostart: false });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(AbortError);
        }
        expect(loader.signal.isRejected()).toBeTrue();
        expect(loader.signal.error).toBeInstanceOf(AbortError);
    });

    test("abort() 会穿透到底层 loader 的 abortSignal", async () => {
        let aborted = false;
        const fn = (args: AsyncLoaderArgs) =>
            new Promise<string>((_resolve, reject) => {
                args.abortSignal.addEventListener("abort", () => {
                    aborted = true;
                    reject(new AbortError());
                });
            });
        const loader = new AsyncLoader(fn, { autostart: false });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
        } catch {
            // 预期 AbortError
        }
        expect(aborted).toBeTrue();
    });

    test("外部 options.abortSignal 中止时联动底层", async () => {
        const external = new AbortController();
        let aborted = false;
        const fn = (args: AsyncLoaderArgs) =>
            new Promise<string>((_resolve, reject) => {
                args.abortSignal.addEventListener("abort", () => {
                    aborted = true;
                    reject(new AbortError());
                });
            });
        const loader = new AsyncLoader(fn, {
            autostart: false,
            abortSignal: external.signal,
        });
        const promise = loader.get();
        external.abort();
        try {
            await promise;
        } catch (e) {
            expect(e).toBeInstanceOf(AbortError);
        }
        expect(aborted).toBeTrue();
        expect(loader.signal.isRejected()).toBeTrue();
    });
});

describe("AsyncLoader 超时", () => {
    test("timeout 超时中止加载并 reject，loading 复位", async () => {
        // loader 永不自然完成，仅监听 abort
        const fn = (args: AsyncLoaderArgs) =>
            new Promise<string>((_resolve, reject) => {
                args.abortSignal.addEventListener("abort", () => reject(new AbortError()));
            });
        const loader = new AsyncLoader(fn, { autostart: false, timeout: 40 });
        const promise = loader.get();
        try {
            await promise;
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(TimeoutError);
        }
        expect(loader.loading).toBeFalse(); // 超时后 loading 复位
    });

    test("未启用重试时超时捕获 TimeoutError", async () => {
        const { fn } = createTimeoutLoader();
        const loader = new AsyncLoader(fn, { autostart: false, timeout: 30 });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(TimeoutError);
            expect((e as Error).name).toBe("TimeoutError");
        }
        expect(loader.signal.error).toBeInstanceOf(TimeoutError);
    });

    test("retry=0 时超时不重试", async () => {
        const { fn, getCalls } = createTimeoutLoader();
        const loader = new AsyncLoader(fn, { autostart: false, timeout: 30 });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(TimeoutError);
        }
        expect(getCalls()).toBe(1);
    });

    test("每次尝试独立超时，超时按 retry 重试", async () => {
        const { fn, getCalls } = createTimeoutLoader();
        const loader = new AsyncLoader(fn, {
            autostart: false,
            timeout: 30,
            retry: 1,
        });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(TimeoutError);
        }
        expect(getCalls()).toBe(2); // 两次尝试均超时
    });

    test("每次尝试拥有独立超时窗口", async () => {
        // 首次因超时失败，第二次在超时内成功
        let calls = 0;
        const fn = (args: AsyncLoaderArgs) => {
            calls++;
            return new Promise<string>((resolve, reject) => {
                // 第一次耗时 100ms（超过 timeout=30），第二次立即成功
                const cost = calls === 1 ? 100 : 0;
                const timer = setTimeout(() => resolve(`v${calls}`), cost);
                args.abortSignal.addEventListener("abort", () => {
                    clearTimeout(timer);
                    reject(new AbortError());
                });
            });
        };
        const loader = new AsyncLoader(fn, {
            autostart: false,
            timeout: 30,
            retry: 1,
        });
        const result = await loader.get();
        expect(result).toBe("v2"); // 第二次尝试成功
        expect(calls).toBe(2);
    });

    test("配置 timeout 但主动 abort 时仍 reject AbortError（与超时区分）", async () => {
        const { fn, getCalls } = createTimeoutLoader();
        const loader = new AsyncLoader(fn, { autostart: false, timeout: 1000 });
        const promise = loader.get();
        loader.abort(); // 主动中止，远早于超时
        try {
            await promise;
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(AbortError);
            expect(e).not.toBeInstanceOf(TimeoutError);
        }
        expect(getCalls()).toBe(1);
    });
});

describe("AsyncLoader 缓存", () => {
    test("缓存命中时不重复调用 loader", async () => {
        const first = createLoader("data", 10);
        const loader1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            hash: "hit",
        });
        await loader1.get();
        expect(first.getCalls()).toBe(1);

        // 同 hash 的新实例应命中缓存
        const second = createLoader("new", 10);
        const loader2 = new AsyncLoader(second.fn, {
            autostart: false,
            cache: 10000,
            hash: "hit",
        });
        const result = await loader2.get();
        expect(result).toBe("data"); // 返回缓存值而非 "new"
        expect(second.getCalls()).toBe(0); // 未调用底层
    });

    test("缓存过期后重新加载", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            cache: 30,
            hash: "expire",
        });
        await loader.get();
        expect(getCalls()).toBe(1);
        await delay(50); // 超过有效期
        loader.load();
        const result = await loader.get();
        expect(result).toBe("data");
        expect(getCalls()).toBe(2); // 过期后重新调用
    });

    test("cache>0 未提供 hash 时自动生成", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false, cache: 10000 });
        expect(loader.options.hash).toBeTruthy();
        const result = await loader.get();
        expect(result).toBe("data");
    });

    test("clear() 清除当前实例缓存后重新加载", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            cache: 10000,
            hash: "clear",
        });
        await loader.get();
        expect(getCalls()).toBe(1);
        loader.clear();
        loader.load();
        await loader.get();
        expect(getCalls()).toBe(2);
    });

    test("clearAll() 清空所有缓存", async () => {
        const a = createLoader("a", 10);
        const loader1 = new AsyncLoader(a.fn, {
            autostart: false,
            cache: 10000,
            hash: "all1",
        });
        await loader1.get(); // 写入缓存
        expect(a.getCalls()).toBe(1);

        loader1.clearAll();

        const b = createLoader("b", 10);
        const loader2 = new AsyncLoader(b.fn, {
            autostart: false,
            cache: 10000,
            hash: "all1",
        });
        const result = await loader2.get();
        expect(b.getCalls()).toBe(1); // 缓存已清空，重新调用
        expect(result).toBe("b");
    });

    test("cache:0 下 fulfilled 后可重新 load 调用底层", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false, cache: 0 });
        await loader.get();
        expect(getCalls()).toBe(1);
        loader.load();
        await loader.get();
        expect(getCalls()).toBe(2);
    });

    test("缓存过期后再次 get() 自动重新加载（无需手动 load）", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            cache: 30,
            hash: "stale",
        });
        await loader.get();
        expect(getCalls()).toBe(1);
        await delay(50); // 超过有效期，缓存失效
        // 无需手动 load()，get() 应自动重新加载
        const result = await loader.get();
        expect(result).toBe("data");
        expect(getCalls()).toBe(2);
    });

    test("缓存过期后 get() 重新加载获取最新值", async () => {
        let count = 0;
        const fn = (args: AsyncLoaderArgs) => {
            count++;
            return new Promise<string>((resolve) => {
                const timer = setTimeout(() => resolve(`v${count}`), 10);
                args.abortSignal.addEventListener("abort", () => clearTimeout(timer));
            });
        };
        const loader = new AsyncLoader(fn, {
            autostart: false,
            cache: 30,
            hash: "refresh",
        });
        expect(await loader.get()).toBe("v1");
        await delay(50); // 缓存失效
        expect(await loader.get()).toBe("v2"); // 重新加载得到最新值
    });

    test("缓存未过期时多次 get() 不重复加载", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            cache: 10000,
            hash: "fresh",
        });
        await loader.get();
        expect(getCalls()).toBe(1);
        // 有效期内多次 get() 不应触发重新加载
        await loader.get();
        await loader.get();
        expect(getCalls()).toBe(1);
    });
});

describe("AsyncLoader get 参数透传", () => {
    test("get({timeout}) 作为 signal 的等待超时生效", async () => {
        // loader 永不自然完成；signal 等待超时后 resolve(undefined)
        const fn = () => new Promise<string>(() => {});
        const loader = new AsyncLoader(fn, { autostart: false });
        const result = await loader.get({ timeout: 50 });
        expect(result).toBeUndefined();
    });
});

describe("AsyncLoader 重试", () => {
    test("retry 默认 0：业务失败不重试", async () => {
        const { fn, getCalls } = createFailingLoader(99, "ok", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect((e as Error).message).toBe("fail#1");
        }
        expect(getCalls()).toBe(1);
    });

    test("retry>0：前 N 次失败后重试成功", async () => {
        const { fn, getCalls } = createFailingLoader(2, "ok", 10);
        const loader = new AsyncLoader(fn, { autostart: false, retry: 2 });
        const result = await loader.get();
        expect(result).toBe("ok");
        expect(getCalls()).toBe(3); // 初始 + 2 次重试
    });

    test("重试耗尽后 reject 最后一次的错误", async () => {
        const { fn, getCalls } = createFailingLoader(99, "ok", 10);
        const loader = new AsyncLoader(fn, { autostart: false, retry: 2 });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect((e as Error).message).toBe("fail#3");
        }
        expect(getCalls()).toBe(3); // 总共 3 次尝试
    });

    test("首次成功时不重试", async () => {
        const { fn, getCalls } = createFailingLoader(0, "ok", 10); // 总是成功
        const loader = new AsyncLoader(fn, { autostart: false, retry: 3 });
        const result = await loader.get();
        expect(result).toBe("ok");
        expect(getCalls()).toBe(1);
    });

    test("retryDelay 在重试前等待", async () => {
        const { fn, getCalls } = createFailingLoader(1, "ok", 5);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 1,
            retryDelay: 60,
        });
        const start = Date.now();
        const result = await loader.get();
        const elapsed = Date.now() - start;
        expect(result).toBe("ok");
        expect(getCalls()).toBe(2);
        // 5(首次) + 60(重试延迟) + 5(重试) ≈ 70ms，至少应覆盖重试延迟
        expect(elapsed).toBeGreaterThanOrEqual(60);
    });

    test("主动 abort 不触发重试", async () => {
        const { fn, getCalls } = createFailingLoader(99, "ok", 100);
        const loader = new AsyncLoader(fn, { autostart: false, retry: 5 });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(AbortError);
        }
        expect(getCalls()).toBe(1); // abort 后不再重试
        expect(loader.loading).toBeFalse();
    });

    test("外部 abortSignal 触发不重试", async () => {
        const external = new AbortController();
        const { fn, getCalls } = createFailingLoader(99, "ok", 100);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 5,
            abortSignal: external.signal,
        });
        const promise = loader.get();
        external.abort();
        try {
            await promise;
        } catch {
            // 预期失败
        }
        expect(getCalls()).toBe(1);
    });
});

describe("AsyncLoader 回调", () => {
    test("onPending/onFulfilled 在实际加载时各触发一次", async () => {
        const { fn } = createLoader("data", 10);
        let pendingCount = 0;
        let fulfilledCount = 0;
        let fulfilledResult: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onPending: () => {
                pendingCount++;
            },
            onFulfilled: (r) => {
                fulfilledCount++;
                fulfilledResult = r;
            },
        });
        await loader.get();
        expect(pendingCount).toBe(1);
        expect(fulfilledCount).toBe(1);
        expect(fulfilledResult).toBe("data");
    });

    test("缓存命中时不触发 onPending/onFulfilled/onRejected", async () => {
        const first = createLoader("data", 10);
        const loader1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            hash: "cb",
        });
        await loader1.get(); // 写入缓存

        const second = createLoader("new", 10);
        let pending2 = 0;
        let fulfilled2 = 0;
        let rejected2 = 0;
        const loader2 = new AsyncLoader(second.fn, {
            autostart: false,
            cache: 10000,
            hash: "cb",
            onPending: () => pending2++,
            onFulfilled: () => fulfilled2++,
            onRejected: () => rejected2++,
        });
        await loader2.get();
        expect(pending2).toBe(0);
        expect(fulfilled2).toBe(0);
        expect(rejected2).toBe(0);
    });

    test("onRejected 失败时带 error，onFulfilled 不触发", async () => {
        const { fn } = createFailingLoader(99, "ok", 10);
        let fulfilledResult: any;
        let rejectedError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onFulfilled: (r) => {
                fulfilledResult = r;
            },
            onRejected: (e) => {
                rejectedError = e;
            },
        });
        try {
            await loader.get();
        } catch {
            // 预期失败
        }
        expect(fulfilledResult).toBeUndefined();
        expect((rejectedError as Error).message).toBe("fail#1");
    });

    test("重试过程 onPending/onFulfilled 仅整体触发一次", async () => {
        const { fn, getCalls } = createFailingLoader(2, "ok", 10);
        let pendingCount = 0;
        let fulfilledCount = 0;
        let rejectedCount = 0;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 2,
            onPending: () => pendingCount++,
            onFulfilled: () => fulfilledCount++,
            onRejected: () => rejectedCount++,
        });
        await loader.get();
        expect(getCalls()).toBe(3); // 初始 + 2 次重试
        expect(pendingCount).toBe(1); // 整体一次
        expect(fulfilledCount).toBe(1); // 最终成功一次
        expect(rejectedCount).toBe(0); // 最终成功，不触发 onRejected
    });

    test("加载中 abort 时 onRejected 触发带 error", async () => {
        const { fn } = createLoader("data", 1000);
        let rejectedError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onRejected: (e) => {
                rejectedError = e;
            },
        });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
        } catch {
            // 预期 AbortError
        }
        expect(rejectedError).toBeInstanceOf(AbortError);
    });

    test("重试等待中 abort 触发 onRejected", async () => {
        const { fn } = createFailingLoader(99, "ok", 5);
        let rejectedCount = 0;
        let rejectedError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 5,
            retryDelay: 200,
            onRejected: (e) => {
                rejectedCount++;
                rejectedError = e;
            },
        });
        const promise = loader.get();
        await delay(20); // 等首次失败进入重试等待
        loader.abort();
        try {
            await promise;
        } catch {
            // 预期 AbortError
        }
        expect(rejectedCount).toBe(1);
        expect(rejectedError).toBeInstanceOf(AbortError);
    });

    test("回调内部抛错被忽略，不影响加载主流程", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onPending: () => {
                throw new Error("pending boom");
            },
            onFulfilled: () => {
                throw new Error("fulfilled boom");
            },
        });
        // 回调抛错不应影响加载流程
        const result = await loader.get();
        expect(result).toBe("data");
        expect(loader.signal.isFulfilled()).toBeTrue();
    });

    test("onPending/onFulfilled/onRejected 支持函数数组并发调用", async () => {
        const { fn } = createLoader("data", 10);
        const pendingCalls: number[] = [];
        const fulfilledResults: any[] = [];
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onPending: [
                () => pendingCalls.push(1),
                () => pendingCalls.push(2),
                () => pendingCalls.push(3),
            ],
            onFulfilled: [
                (r) => fulfilledResults.push(r),
                (r) => fulfilledResults.push(`got:${r}`),
            ],
        });
        await loader.get();
        expect(pendingCalls).toEqual([1, 2, 3]);
        expect(fulfilledResults).toEqual(["data", "got:data"]);
    });

    test("数组中单个回调抛错不影响其他回调", async () => {
        const { fn } = createFailingLoader(99, "ok", 10);
        const rejected: number[] = [];
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onRejected: [
                () => {
                    throw new Error("boom");
                },
                () => rejected.push(1),
                () => rejected.push(2),
            ],
        });
        try {
            await loader.get();
        } catch {
            // 预期失败
        }
        // 第一个回调抛错，后两个仍执行
        expect(rejected).toEqual([1, 2]);
    });

    test("onFulfilled 与 onRejected 语义互斥", async () => {
        // 成功：仅 onFulfilled
        const ok = createLoader("data", 10);
        let okFulfilled = 0;
        let okRejected = 0;
        const loaderOk = new AsyncLoader(ok.fn, {
            autostart: false,
            onFulfilled: () => okFulfilled++,
            onRejected: () => okRejected++,
        });
        await loaderOk.get();
        expect(okFulfilled).toBe(1);
        expect(okRejected).toBe(0);

        // 失败：仅 onRejected
        const fail = createFailingLoader(99, "ok", 10);
        let failFulfilled = 0;
        let failRejected = 0;
        const loaderFail = new AsyncLoader(fail.fn, {
            autostart: false,
            onFulfilled: () => failFulfilled++,
            onRejected: () => failRejected++,
        });
        try {
            await loaderFail.get();
        } catch {
            // 预期失败
        }
        expect(failFulfilled).toBe(0);
        expect(failRejected).toBe(1);
    });
});

describe("AsyncLoader multiplex", () => {
    beforeEach(() => {
        AsyncLoader.clearLoaderCache();
        MapStorage.clear();
    });

    test("multiplex=off 同 hash 为不同实例", () => {
        const a = createLoader("a", 10);
        const l1 = new AsyncLoader(a.fn, { hash: "mp0", multiplex: "off", autostart: false });
        const l2 = new AsyncLoader(a.fn, { hash: "mp0", multiplex: "off", autostart: false });
        expect(l1).not.toBe(l2);
    });

    test("multiplex=restart 命中 inflight：中止前面加载并以首个 loader 为准重启", async () => {
        const a1 = createLoader("v1", 50);
        const a2 = createLoader("v2", 50);
        const l1 = new AsyncLoader(a1.fn, { hash: "mp1", multiplex: "restart" });
        expect(a1.getCalls()).toBe(1); // l1 首次加载
        expect(l1.loading).toBeTrue();

        // 命中 → abort l1 进行中加载，以首个 loader(a1) 重新加载；a2 被忽略
        const l2 = new AsyncLoader(a2.fn, { hash: "mp1", multiplex: "restart" });
        expect(l2).toBe(l1);
        expect(a2.getCalls()).toBe(0); // 新 loader 函数被忽略
        expect(a1.getCalls()).toBe(2); // abort 后用首个 a1 重启

        // 结果均为首个 loader(a1) 的值
        expect(await l1.get()).toBe("v1");
        expect(await l2.get()).toBe("v1");
    });

    test("multiplex=share 命中 inflight：完全共享，底层只调一次", async () => {
        const a = createLoader("shared", 50);
        const l1 = new AsyncLoader(a.fn, { hash: "mp2", multiplex: "share" });
        expect(a.getCalls()).toBe(1);

        const b = createLoader("other", 50);
        const l2 = new AsyncLoader(b.fn, { hash: "mp2", multiplex: "share" });
        expect(l2).toBe(l1);
        expect(b.getCalls()).toBe(0);

        const [r1, r2] = await Promise.all([l1.get(), l2.get()]);
        expect(r1).toBe("shared");
        expect(r2).toBe("shared");
        expect(a.getCalls()).toBe(1); // in-flight 共享，只调一次底层
    });

    test("加载完成后移除：再 new 同 hash 得新实例", async () => {
        const a = createLoader("v1", 10);
        const l1 = new AsyncLoader(a.fn, { hash: "done", multiplex: "share", autostart: false });
        await l1.get(); // 完成后从 loaderCache 移除

        const b = createLoader("v2", 10);
        const l2 = new AsyncLoader(b.fn, { hash: "done", multiplex: "share", autostart: false });
        expect(l2).not.toBe(l1);
    });

    test("加载完成 + data cache 命中：再 new 同 hash 不重新加载", async () => {
        const a = createLoader("cached", 10);
        const l1 = new AsyncLoader(a.fn, { hash: "dc", multiplex: "share", cache: 10000 });
        await l1.get();
        expect(a.getCalls()).toBe(1);

        const b = createLoader("new", 10);
        const l2 = new AsyncLoader(b.fn, { hash: "dc", multiplex: "share", cache: 10000 });
        expect(l2).not.toBe(l1);
        const result = await l2.get();
        expect(result).toBe("cached"); // 命中 data cache
        expect(b.getCalls()).toBe(0);
    });

    test("加载完成 + cache 过期：再 new 同 hash 重新加载", async () => {
        let count = 0;
        const fn = (args: AsyncLoaderArgs) => {
            count++;
            return new Promise<string>((resolve) => {
                const t = setTimeout(() => resolve(`v${count}`), 10);
                args.abortSignal.addEventListener("abort", () => clearTimeout(t));
            });
        };
        const l1 = new AsyncLoader(fn, { hash: "exp", multiplex: "share", cache: 30 });
        expect(await l1.get()).toBe("v1");
        await delay(50); // cache 过期，l1 已完成移除

        const l2 = new AsyncLoader(fn, { hash: "exp", multiplex: "share", cache: 30 });
        expect(l2).not.toBe(l1);
        expect(await l2.get()).toBe("v2");
        expect(count).toBe(2);
    });

    test("重试期间仍 inflight：mp=2 命中同实例", async () => {
        const { fn } = createFailingLoader(99, "ok", 5); // 持续失败
        const l1 = new AsyncLoader(fn, {
            hash: "rt",
            multiplex: "share",
            retry: 5,
            retryDelay: 200,
        });
        await delay(20); // 进入重试等待
        expect(l1.loading).toBeTrue();

        const l2 = new AsyncLoader(fn, {
            hash: "rt",
            multiplex: "share",
            retry: 5,
            retryDelay: 200,
        });
        expect(l2).toBe(l1); // 重试不移除，命中
        l1.abort(); // 清理，避免悬空重试
    });

    test("abort 后移除：再 new 同 hash 得新实例", () => {
        const a = createLoader("v", 50);
        const l1 = new AsyncLoader(a.fn, { hash: "ab", multiplex: "share" });
        expect(l1.loading).toBeTrue();
        l1.abort();

        const b = createLoader("v", 50);
        const l2 = new AsyncLoader(b.fn, { hash: "ab", multiplex: "share" });
        expect(l2).not.toBe(l1);
        l2.abort();
    });

    test("multiplex 复用不依赖 autostart：autostart=false 时 l2===l1，get 共享一次加载", async () => {
        const a = createLoader("v", 50);
        const l1 = new AsyncLoader(a.fn, { hash: "as", multiplex: "share", autostart: false });
        expect(a.getCalls()).toBe(0); // l1 未加载（pending），但已登记到 loaderCache

        const b = createLoader("vb", 50);
        const l2 = new AsyncLoader(b.fn, { hash: "as", multiplex: "share", autostart: false });
        expect(l2).toBe(l1); // pending 态也复用同一实例
        expect(a.getCalls()).toBe(0);

        // 无论 l1.get 还是 l2.get，只触发一次底层加载
        const [r1, r2] = await Promise.all([l1.get(), l2.get()]);
        expect(r1).toBe("v");
        expect(r2).toBe("v");
        expect(a.getCalls()).toBe(1);
        expect(b.getCalls()).toBe(0); // b.fn 被忽略
    });

    test("multiplex>0 未显式 hash：相同 loader 函数自动生成相同 hash 并复用", () => {
        const a = createLoader("v", 10);
        const l1 = new AsyncLoader(a.fn, { multiplex: "restart", autostart: false });
        const l2 = new AsyncLoader(a.fn, { multiplex: "restart", autostart: false });
        expect(l1).toBe(l2); // 相同 fn → 相同 hash → 复用
        expect(l1.options.hash).toBe(l2.options.hash);
    });

    test("multiplex>0 不同 loader 函数：自动生成不同 hash，独立实例", () => {
        // createLoader 返回的 fn 源码相同（仅闭包 value 不同），故用源码不同的内联函数验证 hash 区分
        const fn1 = (_args: AsyncLoaderArgs) => Promise.resolve("a");
        const fn2 = (_args: AsyncLoaderArgs) => Promise.resolve("b");
        const l1 = new AsyncLoader(fn1, { multiplex: "restart", autostart: false });
        const l2 = new AsyncLoader(fn2, { multiplex: "restart", autostart: false });
        expect(l1).not.toBe(l2);
        expect(l1.options.hash).not.toBe(l2.options.hash);
    });

    test("multiplex>0 显式 hash 优先于自动生成", () => {
        const a = createLoader("v", 10);
        const l1 = new AsyncLoader(a.fn, {
            multiplex: "restart",
            hash: "manual",
            autostart: false,
        });
        expect(l1.options.hash).toBe("manual");
    });

    test("clearLoaderCache() 后同 hash 得新实例", () => {
        const a = createLoader("v", 50);
        const l1 = new AsyncLoader(a.fn, { hash: "clr", multiplex: "share" });
        expect(AsyncLoader.loaderCache?.has("clr")).toBeTrue();
        AsyncLoader.clearLoaderCache();
        expect(AsyncLoader.loaderCache?.has("clr")).toBeFalse();

        const b = createLoader("v", 50);
        const l2 = new AsyncLoader(b.fn, { hash: "clr", multiplex: "share" });
        expect(l2).not.toBe(l1);
        l1.abort();
        l2.abort();
    });

    test("multiplex=share 并发构造多个 loader：全部共享首个实例与一次加载", async () => {
        // 每个 loader 返回不同值，验证 mp=2 始终用首个 loader（共享）
        const makers = Array.from({ length: 5 }, (_, i) => createLoader(`v${i}`, 50));
        const loaders = makers.map(
            (m) => new AsyncLoader(m.fn, { hash: "conc-mp2", multiplex: "share" }),
        );
        for (const l of loaders) expect(l).toBe(loaders[0]);
        // 并发 get：mp=2 共享首个 loader，结果均为 v0
        const results = await Promise.all(loaders.map((l) => l.get()));
        expect(results.every((r) => r === "v0")).toBeTrue();
        expect(makers[0].getCalls()).toBe(1);
        for (let i = 1; i < makers.length; i++) expect(makers[i].getCalls()).toBe(0);
    });

    test("multiplex=restart 并发构造多个 loader：每次命中中止重启，以首个 loader 为准", async () => {
        // 每个 loader 返回不同值，验证 mp=1 始终用首个 loader
        const makers = [
            createLoader("v1", 100),
            createLoader("v2", 100),
            createLoader("v3", 100),
            createLoader("v4", 100),
        ];
        const loaders = makers.map(
            (m) => new AsyncLoader(m.fn, { hash: "conc-mp1", multiplex: "restart" }),
        );
        for (const l of loaders) expect(l).toBe(loaders[0]);
        // mp=1 以首个 loader(a1) 为准：所有 loader 的 get 结果均为 v1
        const results = await Promise.all(loaders.map((l) => l.get()));
        expect(results.every((r) => r === "v1")).toBeTrue();
    });

    test("multiplex=share 交错并发：加载中持续加入新 loader 仍共享同一加载", async () => {
        const a = createLoader("v", 80);
        const l1 = new AsyncLoader(a.fn, { hash: "interleave", multiplex: "share" });
        const p1 = l1.get();
        await delay(20); // 加载中
        const l2 = new AsyncLoader(a.fn, { hash: "interleave", multiplex: "share" });
        expect(l2).toBe(l1);
        await delay(20); // 仍加载中
        const l3 = new AsyncLoader(a.fn, { hash: "interleave", multiplex: "share" });
        expect(l3).toBe(l1);
        const results = await Promise.all([p1, l2.get(), l3.get()]);
        expect(results).toEqual(["v", "v", "v"]);
        expect(a.getCalls()).toBe(1);
    });

    test("multiplex=restart abort 前面加载：已 await 的 .get() reject AbortError", async () => {
        const a = createLoader("va", 100);
        const l1 = new AsyncLoader(a.fn, { hash: "abort-await", multiplex: "restart" });
        const p1 = l1.get(); // 已 await，持有进行中加载的 signal promise
        expect(a.getCalls()).toBe(1);

        // 新 loader 命中 → abort l1 进行中加载 → p1 reject AbortError
        const l2 = new AsyncLoader(a.fn, { hash: "abort-await", multiplex: "restart" });
        expect(l2).toBe(l1);
        try {
            await p1;
            expect(false).toBeTrue(); // 不应到达：p1 应被 abort
        } catch (e) {
            expect(e).toBeInstanceOf(AbortError);
        }

        // l2(===l1) 已 abort+load 重新加载，后续 get 拿到新结果
        const result = await l2.get();
        expect(result).toBe("va");
    });

    test("multiplex=restart abort 前面加载：未调用 .get() 时无 rejection 泄漏，后续 get 正常", async () => {
        const a = createLoader("va", 100);
        const l1 = new AsyncLoader(a.fn, { hash: "abort-noget", multiplex: "restart" });
        expect(l1.loading).toBeTrue();
        // l1 未调用 get()：无人 await 旧 signal

        const l2 = new AsyncLoader(a.fn, { hash: "abort-noget", multiplex: "restart" });
        expect(l2).toBe(l1);
        expect(a.getCalls()).toBe(2); // abort(#1 取消) + load(#2 重启)

        // abort 的 reject 由 signal 默认捕获，无未捕获 rejection；后续 get 拿重新加载结果
        const result = await l2.get();
        expect(result).toBe("va");
    });
});

describe("AsyncLoader defaultValue 兜底", () => {
    test("业务错误 + defaultValue：吞错 resolve 默认值", async () => {
        const { fn } = createFailingLoader(99, "ok", 10); // 持续失败
        const loader = new AsyncLoader(fn, { autostart: false, defaultValue: "fallback" });
        const result = await loader.get();
        expect(result).toBe("fallback");
        expect(loader.signal.isFulfilled()).toBeTrue();
    });

    test("超时 + defaultValue：吞错 resolve 默认值（非 TimeoutError）", async () => {
        const { fn } = createTimeoutLoader();
        const loader = new AsyncLoader(fn, {
            autostart: false,
            timeout: 30,
            defaultValue: "fallback",
        });
        const result = await loader.get();
        expect(result).toBe("fallback");
        expect(loader.signal.isFulfilled()).toBeTrue();
    });

    test("业务错误 + 无 defaultValue：抛原错误（原逻辑）", async () => {
        const { fn } = createFailingLoader(99, "ok", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect((e as Error).message).toBe("fail#1");
        }
    });

    test("abort + defaultValue：defaultValue 不生效，抛 AbortError", async () => {
        const { fn } = createLoader("data", 1000);
        const loader = new AsyncLoader(fn, { autostart: false, defaultValue: "fallback" });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(AbortError);
        }
    });

    test("defaultValue 为 falsy(0)：显式提供即生效", async () => {
        let calls = 0;
        const fn = (args: AsyncLoaderArgs) => {
            calls++;
            return new Promise<number>((_resolve, reject) => {
                const t = setTimeout(() => reject(new Error(`fail#${calls}`)), 10);
                args.abortSignal.addEventListener("abort", () => {
                    clearTimeout(t);
                    reject(new AbortError());
                });
            });
        };
        const loader = new AsyncLoader<number>(fn, { autostart: false, defaultValue: 0 });
        const result = await loader.get();
        expect(result).toBe(0);
    });

    test("重试耗尽 + defaultValue：重试后兜底", async () => {
        const { fn, getCalls } = createFailingLoader(99, "ok", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 1,
            defaultValue: "fallback",
        });
        const result = await loader.get();
        expect(result).toBe("fallback");
        expect(getCalls()).toBe(2); // 初始 + 1 次重试
    });
});

describe("AsyncLoader refresh/invalidate", () => {
    test("refresh 忽略有效缓存强制重载（且可 await）", async () => {
        const first = createLoader("old", 10);
        const loader1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            hash: "refresh-hit",
        });
        await loader1.get();
        expect(first.getCalls()).toBe(1);

        // 同 hash 新实例：get 命中缓存返回旧值，不调用底层
        const second = createLoader("new", 10);
        const loader2 = new AsyncLoader<string>(second.fn, {
            autostart: false,
            cache: 10000,
            hash: "refresh-hit",
        });
        const cached = await loader2.get();
        expect(cached).toBe("old");
        expect(second.getCalls()).toBe(0);

        // refresh 清缓存并强制重载：拿到新值
        const r = await loader2.refresh();
        expect(r).toBe("new");
        expect(second.getCalls()).toBe(1);
    });

    test("refresh 进行中加载：中止 inflight 后重启拿新值", async () => {
        const first = createLoader("old", 100); // 慢加载
        const loader = new AsyncLoader(first.fn, {
            autostart: false,
            hash: "refresh-inflight",
        });
        loader.load(); // 发起慢加载
        await delay(5);

        // 替换为快的新 loader 函数后 refresh：旧 inflight 被 abort，重新加载拿新值
        const second = createLoader("new", 10);
        loader.loader = second.fn;
        const r = await loader.refresh();
        expect(r).toBe("new");
        expect(second.getCalls()).toBe(1);
    });

    test("invalidate 后下次 get 重新加载（有缓存）", async () => {
        const first = createLoader("old", 10);
        const loader1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            hash: "inv-cache",
        });
        await loader1.get();

        const second = createLoader("new", 10);
        const loader2 = new AsyncLoader<string>(second.fn, {
            autostart: false,
            cache: 10000,
            hash: "inv-cache",
        });
        loader2.invalidate();
        expect(loader2.loading).toBe(false); // 仅标记失效，不立即触发加载

        const r = await loader2.get();
        expect(r).toBe("new"); // 缓存被清，重新加载
        expect(second.getCalls()).toBe(1);
    });

    test("invalidate 无缓存场景：下次 get 强制重载（clear 无法做到）", async () => {
        let val = "old";
        let calls = 0;
        const fn = (args: AsyncLoaderArgs) => {
            calls++;
            const cur = val;
            return new Promise<string>((resolve, reject) => {
                const t = setTimeout(() => resolve(cur), 10);
                args.abortSignal.addEventListener("abort", () => {
                    clearTimeout(t);
                    reject(new AbortError());
                });
            });
        };
        const loader = new AsyncLoader<string>(fn, { autostart: false }); // cache=0

        expect(await loader.get()).toBe("old");
        expect(calls).toBe(1);

        // 无缓存时 get 直接返回已完成的 signal 结果，不重载
        val = "new";
        expect(await loader.get()).toBe("old");
        expect(calls).toBe(1);

        // clear() 在 cache=0 时无效，仍不重载
        loader.clear();
        expect(await loader.get()).toBe("old");
        expect(calls).toBe(1);

        // invalidate() reset signal → 下次 get 重新加载（核心价值）
        loader.invalidate();
        expect(await loader.get()).toBe("new");
        expect(calls).toBe(2);
    });
});

describe("AsyncLoader 加载终态后再次 get()", () => {
    test("成功终态(cache=0)：再次 get() 立即返回同一结果，不重新加载", async () => {
        const { fn, getCalls } = createLoader("ok", 10);
        const loader = new AsyncLoader(fn, { autostart: false }); // cache=0 默认无缓存

        const r1 = await loader.get();
        expect(r1).toBe("ok");
        expect(getCalls()).toBe(1);
        expect(loader.signal.isFulfilled()).toBeTrue();

        // signal 已 fulfilled：再次 get() 不触发 load()，立即返回已缓存的结果
        const r2 = await loader.get();
        expect(r2).toBe("ok");
        expect(getCalls()).toBe(1); // 未重新调用底层
        expect(loader.signal.isFulfilled()).toBeTrue();
    });

    test("失败终态(cache=0)：再次 get() 重新发起加载并再次失败（自动重试语义）", async () => {
        const { fn, getCalls } = createFailingLoader(99, "ok", 10); // 持续失败
        const loader = new AsyncLoader(fn, { autostart: false });

        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect((e as Error).message).toBe("fail#1");
        }
        expect(getCalls()).toBe(1);
        expect(loader.signal.isRejected()).toBeTrue();

        // rejected 非记忆终态：再次 get() 重新加载（reset signal + 重新调用底层），而非立即返回上次错误
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect((e as Error).message).toBe("fail#2");
        }
        expect(getCalls()).toBe(2); // 重新加载 → 底层再次被调用
    });

    test("失败终态后底层恢复：再次 get() 重新加载并成功拿到新值", async () => {
        // 可变 loader：首次失败，之后成功并返回新值
        let calls = 0;
        const fn = (args: AsyncLoaderArgs) => {
            calls++;
            return new Promise<string>((resolve, reject) => {
                const t = setTimeout(() => {
                    if (calls === 1) reject(new Error("fail#1"));
                    else resolve("recovered");
                }, 10);
                args.abortSignal.addEventListener("abort", () => {
                    clearTimeout(t);
                    reject(new AbortError());
                });
            });
        };
        const loader = new AsyncLoader(fn, { autostart: false });

        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect((e as Error).message).toBe("fail#1");
        }
        expect(calls).toBe(1);
        expect(loader.signal.isRejected()).toBeTrue();

        // 底层恢复后再次 get()：重新加载并成功，rejected → fulfilled 透明恢复
        const r = await loader.get();
        expect(r).toBe("recovered");
        expect(calls).toBe(2);
        expect(loader.signal.isFulfilled()).toBeTrue();
    });
});

describe("AsyncLoader 同步 loader（返回 Promise<T> | T）", () => {
    test("同步返回值：get() 拿到同步值，signal fulfilled，loading 复位", async () => {
        const { fn, getCalls } = createSyncLoader("sync-data");
        const loader = new AsyncLoader(fn, { autostart: false });
        const result = await loader.get();
        expect(result).toBe("sync-data");
        expect(getCalls()).toBe(1);
        expect(loader.signal.isFulfilled()).toBeTrue();
        expect(loader.loading).toBeFalse();
    });

    test("同步返回值保持泛型类型", async () => {
        const loader = new AsyncLoader<{ id: number }>(
            () => ({ id: 7 }), // 同步对象
            { autostart: false },
        );
        const result = await loader.get();
        expect(result.id).toBe(7);
    });

    test("同步返回值与 cache 兼容：命中缓存不重复调用底层", async () => {
        const first = createSyncLoader("a");
        const loader1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            hash: "sync-cache",
        });
        await loader1.get();
        expect(first.getCalls()).toBe(1);

        // 同 hash 新实例命中缓存，返回旧值且不调用底层
        const second = createSyncLoader("b");
        const loader2 = new AsyncLoader(second.fn, {
            autostart: false,
            cache: 10000,
            hash: "sync-cache",
        });
        const result = await loader2.get();
        expect(result).toBe("a");
        expect(second.getCalls()).toBe(0);
    });

    test("同步 throw 走错误链：无 retry/defaultValue 时 reject 原错误", async () => {
        const { fn, getCalls } = createSyncFailingLoader(99, "ok");
        const loader = new AsyncLoader(fn, { autostart: false });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect((e as Error).message).toBe("sync-fail#1");
        }
        expect(getCalls()).toBe(1);
        expect(loader.signal.isRejected()).toBeTrue();
        expect(loader.loading).toBeFalse();
    });

    test("同步 throw + retry：前 N 次抛错后重试成功", async () => {
        const { fn, getCalls } = createSyncFailingLoader(2, "ok");
        const loader = new AsyncLoader(fn, { autostart: false, retry: 2 });
        const result = await loader.get();
        expect(result).toBe("ok");
        expect(getCalls()).toBe(3); // 初始 + 2 次重试
    });

    test("同步 throw + defaultValue：吞错 resolve 默认值", async () => {
        const { fn } = createSyncFailingLoader(99, "ok");
        const loader = new AsyncLoader(fn, { autostart: false, defaultValue: "fallback" });
        const result = await loader.get();
        expect(result).toBe("fallback");
        expect(loader.signal.isFulfilled()).toBeTrue();
    });

    test("同步 throw + onRejected：触发带 error", async () => {
        const { fn } = createSyncFailingLoader(99, "ok");
        let rejectedError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onRejected: (e) => {
                rejectedError = e;
            },
        });
        try {
            await loader.get();
        } catch {
            // 预期同步失败
        }
        expect((rejectedError as Error).message).toBe("sync-fail#1");
    });

    test("同步成功后 abort 无副作用：已完成终态不被改变", async () => {
        const { fn } = createSyncLoader("sync");
        const loader = new AsyncLoader(fn, { autostart: false });
        const result = await loader.get();
        expect(result).toBe("sync");
        loader.abort(); // 已 fulfilled，abort 不改变终态
        expect(loader.signal.isFulfilled()).toBeTrue();
    });
});

describe("AsyncLoader 加载状态 isPending/isFulfilled/isRejected", () => {
    test("未加载（autostart=false）：三态皆 false（既未在加载也无结果）", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        expect(loader.isPending()).toBeFalse();
        expect(loader.isFulfilled()).toBeFalse();
        expect(loader.isRejected()).toBeFalse();
    });

    test("加载中：isPending=true（与 loading 一致）", async () => {
        const { fn } = createLoader("data", 50);
        const loader = new AsyncLoader(fn, { autostart: false });
        loader.load();
        expect(loader.isPending()).toBeTrue();
        expect(loader.loading).toBeTrue();
        expect(loader.isFulfilled()).toBeFalse();
        expect(loader.isRejected()).toBeFalse();
        await loader.get(); // 收尾，避免悬空加载
        expect(loader.isPending()).toBeFalse();
        expect(loader.loading).toBeFalse();
        expect(loader.isFulfilled()).toBeTrue();
    });

    test("加载成功：isFulfilled=true，isPending=false", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        await loader.get();
        expect(loader.isFulfilled()).toBeTrue();
        expect(loader.isPending()).toBeFalse();
        expect(loader.isRejected()).toBeFalse();
    });

    test("加载失败：isRejected=true，isPending=false", async () => {
        const { fn } = createFailingLoader(99, "ok", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        try {
            await loader.get();
        } catch {
            // 预期失败
        }
        expect(loader.isRejected()).toBeTrue();
        expect(loader.isPending()).toBeFalse();
        expect(loader.isFulfilled()).toBeFalse();
        expect(loader.loading).toBeFalse();
    });

    test("重试期间：isPending 保持 true（重试属加载过程）", async () => {
        const { fn } = createFailingLoader(2, "ok", 5);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 2,
            retryDelay: 30,
        });
        loader.load();
        await delay(20); // 首次失败(5ms)后进入重试等待(30ms)
        expect(loader.isPending()).toBeTrue();
        await loader.get(); // 收尾，等重试成功
    });

    test("abort 后：isRejected=true，isPending=false", async () => {
        const { fn } = createLoader("data", 1000);
        const loader = new AsyncLoader(fn, { autostart: false });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
        } catch {
            // 预期 AbortError
        }
        expect(loader.isRejected()).toBeTrue();
        expect(loader.isPending()).toBeFalse();
    });

    test("缓存命中：isFulfilled=true，isPending=false（命中非加载）", async () => {
        const first = createLoader("data", 10);
        const l1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            hash: "state-cache",
        });
        await l1.get();

        const second = createLoader("new", 10);
        const l2 = new AsyncLoader(second.fn, {
            autostart: false,
            cache: 10000,
            hash: "state-cache",
        });
        await l2.get(); // 命中缓存
        expect(l2.isFulfilled()).toBeTrue();
        expect(l2.isPending()).toBeFalse();
    });

    test("invalidate 后：终态清除，isPending=false（未重新加载前不视为加载中）", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            cache: 10000,
            hash: "state-inv",
        });
        await loader.get();
        expect(loader.isFulfilled()).toBeTrue();
        loader.invalidate();
        expect(loader.isPending()).toBeFalse(); // 仅标记失效，未立即加载
        expect(loader.isFulfilled()).toBeFalse(); // reset 后终态清除
    });
});

describe("AsyncLoader 结果与错误访问（result / error）", () => {
    test("加载成功：result 返回加载值，error 为 undefined", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        expect(loader.result).toBeUndefined(); // 加载前
        expect(loader.error).toBeUndefined();
        await loader.get();
        expect(loader.result).toBe("data");
        expect(loader.error).toBeUndefined();
    });

    test("加载失败：error 返回错误，result 为 undefined", async () => {
        const { fn } = createFailingLoader(99, "ok", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        try {
            await loader.get();
        } catch {
            // 预期失败
        }
        expect(loader.error).toBeInstanceOf(Error);
        expect((loader.error as Error).message).toBe("fail#1");
        expect(loader.result).toBeUndefined();
    });

    test("abort 后：error 为 AbortError，result 为 undefined", async () => {
        const { fn } = createLoader("data", 1000);
        const loader = new AsyncLoader(fn, { autostart: false });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
        } catch {
            // 预期 AbortError
        }
        expect(loader.error).toBeInstanceOf(AbortError);
        expect(loader.result).toBeUndefined();
    });

    test("defaultValue 兜底：result 为默认值，error 为 undefined", async () => {
        const { fn } = createFailingLoader(99, "ok", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            defaultValue: "fallback",
        });
        await loader.get();
        expect(loader.result).toBe("fallback");
        expect(loader.error).toBeUndefined();
    });

    test("result / error 与 signal.result / signal.error 始终同步", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false });
        expect(loader.result).toBe(loader.signal.result);
        expect(loader.error).toBe(loader.signal.error);
        await loader.get();
        expect(loader.result).toBe(loader.signal.result);
        expect(loader.error).toBe(loader.signal.error);
    });
});

describe("AsyncLoader 元数据（meta）", () => {
    test("加载函数通过 args.meta 写入，loader.meta 可读", async () => {
        const loader = new AsyncLoader<string, { statusCode?: number }>(
            (args) => {
                args.meta.statusCode = 200;
                return "data";
            },
            { autostart: false, meta: {} },
        );
        await loader.get();
        expect(loader.meta.statusCode).toBe(200);
    });

    test("构造时传入初始 meta，加载函数可读取", async () => {
        const loader = new AsyncLoader<number, { id: number }>(
            (args) => args.meta.id,
            { autostart: false, meta: { id: 42 } },
        );
        expect(await loader.get()).toBe(42);
        expect(loader.meta.id).toBe(42);
    });

    test("未提供 meta 时默认为空对象，加载函数可写入", async () => {
        const loader = new AsyncLoader<string>(
            (args) => {
                args.meta.foo = "bar";
                return "data";
            },
            { autostart: false },
        );
        await loader.get();
        expect(loader.meta.foo).toBe("bar");
    });

    test("模拟 fetch 场景：将响应状态码保存到 meta", async () => {
        interface FetchMeta {
            statusCode?: number;
        }
        const fakeResponse = { status: 200, body: "ok" };
        const loader = new AsyncLoader<string, FetchMeta>(
            async (args) => {
                // 模拟 fetch 完成后保存状态码到 meta
                args.meta.statusCode = fakeResponse.status;
                return fakeResponse.body;
            },
            { autostart: false, meta: {} },
        );
        expect(await loader.get()).toBe("ok");
        expect(loader.meta.statusCode).toBe(200);
    });

    test("加载失败时加载函数写入的 meta 仍可见", async () => {
        const loader = new AsyncLoader<string, { statusCode?: number }>(
            (args) => {
                args.meta.statusCode = 500;
                throw new Error("server error");
            },
            { autostart: false, meta: {} },
        );
        try {
            await loader.get();
        } catch {
            // 预期失败
        }
        expect(loader.meta.statusCode).toBe(500);
    });

    test("args.meta 与 loader.meta 为同一引用（写入即外部可见）", async () => {
        let argsMeta: Record<string, any> | undefined;
        const loader = new AsyncLoader<string>(
            (args) => {
                argsMeta = args.meta;
                return "data";
            },
            { autostart: false },
        );
        await loader.get();
        expect(argsMeta).toBe(loader.meta);
    });

    test("重试过程共享同一 meta（多次尝试累积写入）", async () => {
        const loader = new AsyncLoader<string, { attempts: number[] }>(
            (args) => {
                args.meta.attempts.push(args.meta.attempts.length + 1);
                if (args.meta.attempts.length < 3) throw new Error("retry");
                return "ok";
            },
            { autostart: false, retry: 3, meta: { attempts: [] } },
        );
        const result = await loader.get();
        expect(result).toBe("ok");
        expect(loader.meta.attempts).toEqual([1, 2, 3]);
    });
});