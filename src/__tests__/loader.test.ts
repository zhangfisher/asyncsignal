import { describe, test, expect, beforeEach } from "bun:test";
import { AbortError } from "../errors";
import { AsyncLoader, AsyncLoaderArgs } from "../loader";

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

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("AsyncLoader 基本加载", () => {
    beforeEach(() => AsyncLoader.clearAll());

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
    beforeEach(() => AsyncLoader.clearAll());

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
    beforeEach(() => AsyncLoader.clearAll());

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
            expect(e).toBeInstanceOf(AbortError);
        }
        expect(loader.loading).toBeFalse(); // 超时后 loading 复位
    });
});

describe("AsyncLoader 缓存", () => {
    beforeEach(() => AsyncLoader.clearAll());

    test("缓存命中时不重复调用 loader", async () => {
        const first = createLoader("data", 10);
        const loader1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            cacheKey: "hit",
        });
        await loader1.get();
        expect(first.getCalls()).toBe(1);

        // 同 cacheKey 的新实例应命中缓存
        const second = createLoader("new", 10);
        const loader2 = new AsyncLoader(second.fn, {
            autostart: false,
            cache: 10000,
            cacheKey: "hit",
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
            cacheKey: "expire",
        });
        await loader.get();
        expect(getCalls()).toBe(1);
        await delay(50); // 超过有效期
        loader.load();
        const result = await loader.get();
        expect(result).toBe("data");
        expect(getCalls()).toBe(2); // 过期后重新调用
    });

    test("cache>0 未提供 cacheKey 时自动生成", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, { autostart: false, cache: 10000 });
        expect(loader.options.cacheKey).toBeTruthy();
        const result = await loader.get();
        expect(result).toBe("data");
    });

    test("clear() 清除当前实例缓存后重新加载", async () => {
        const { fn, getCalls } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            cache: 10000,
            cacheKey: "clear",
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
            cacheKey: "all1",
        });
        await loader1.get(); // 写入缓存
        expect(a.getCalls()).toBe(1);

        AsyncLoader.clearAll();

        const b = createLoader("b", 10);
        const loader2 = new AsyncLoader(b.fn, {
            autostart: false,
            cache: 10000,
            cacheKey: "all1",
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
            cacheKey: "stale",
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
            cacheKey: "refresh",
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
            cacheKey: "fresh",
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
    beforeEach(() => AsyncLoader.clearAll());

    test("get({timeout}) 作为 signal 的等待超时生效", async () => {
        // loader 永不自然完成；signal 等待超时后 resolve(undefined)
        const fn = () => new Promise<string>(() => {});
        const loader = new AsyncLoader(fn, { autostart: false });
        const result = await loader.get({ timeout: 50 });
        expect(result).toBeUndefined();
    });
});

describe("AsyncLoader 重试", () => {
    beforeEach(() => AsyncLoader.clearAll());

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
            expect(e).toBeInstanceOf(AbortError);
        }
        expect(getCalls()).toBe(2); // 两次尝试均超时
    });

    test("retry=0 时超时不重试", async () => {
        const { fn, getCalls } = createTimeoutLoader();
        const loader = new AsyncLoader(fn, { autostart: false, timeout: 30 });
        try {
            await loader.get();
            expect(false).toBeTrue(); // 不应到达
        } catch (e) {
            expect(e).toBeInstanceOf(AbortError);
        }
        expect(getCalls()).toBe(1);
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
});
