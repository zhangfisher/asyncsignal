import { describe, test, expect, beforeEach } from "bun:test";
import { AbortError, TimeoutError } from "../errors";
import { AsyncLoader, AsyncLoaderArgs } from "../loader";
import { MapStorage } from "../storeage";

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
    test("onBeforeLoad/onAfterLoad 在实际加载时各触发一次", async () => {
        const { fn } = createLoader("data", 10);
        let beforeCount = 0;
        let afterCount = 0;
        let afterResult: any;
        let afterError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onBeforeLoad: () => {
                beforeCount++;
            },
            onAfterLoad: (r, e) => {
                afterCount++;
                afterResult = r;
                afterError = e;
            },
        });
        await loader.get();
        expect(beforeCount).toBe(1);
        expect(afterCount).toBe(1);
        expect(afterResult).toBe("data");
        expect(afterError).toBeUndefined();
    });

    test("缓存命中时不触发 onBeforeLoad/onAfterLoad", async () => {
        const first = createLoader("data", 10);
        const loader1 = new AsyncLoader(first.fn, {
            autostart: false,
            cache: 10000,
            hash: "cb",
        });
        await loader1.get(); // 写入缓存

        const second = createLoader("new", 10);
        let before2 = 0;
        let after2 = 0;
        const loader2 = new AsyncLoader(second.fn, {
            autostart: false,
            cache: 10000,
            hash: "cb",
            onBeforeLoad: () => before2++,
            onAfterLoad: () => after2++,
        });
        await loader2.get();
        expect(before2).toBe(0);
        expect(after2).toBe(0);
    });

    test("onAfterLoad 失败时带 error", async () => {
        const { fn } = createFailingLoader(99, "ok", 10);
        let afterResult: any;
        let afterError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onAfterLoad: (r, e) => {
                afterResult = r;
                afterError = e;
            },
        });
        try {
            await loader.get();
        } catch {
            // 预期失败
        }
        expect(afterResult).toBeUndefined();
        expect((afterError as Error).message).toBe("fail#1");
    });

    test("重试过程 onBeforeLoad/onAfterLoad 仅整体触发一次", async () => {
        const { fn, getCalls } = createFailingLoader(2, "ok", 10);
        let beforeCount = 0;
        let afterCount = 0;
        let afterError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 2,
            onBeforeLoad: () => beforeCount++,
            onAfterLoad: (_r, e) => {
                afterCount++;
                afterError = e;
            },
        });
        await loader.get();
        expect(getCalls()).toBe(3); // 初始 + 2 次重试
        expect(beforeCount).toBe(1); // 整体一次
        expect(afterCount).toBe(1); // 最终一次
        expect(afterError).toBeUndefined(); // 最终成功
    });

    test("加载中 abort 时 onAfterLoad 触发带 error", async () => {
        const { fn } = createLoader("data", 1000);
        let afterError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onAfterLoad: (_r, e) => {
                afterError = e;
            },
        });
        const promise = loader.get();
        loader.abort();
        try {
            await promise;
        } catch {
            // 预期 AbortError
        }
        expect(afterError).toBeInstanceOf(AbortError);
    });

    test("重试等待中 abort 触发 onAfterLoad", async () => {
        const { fn } = createFailingLoader(99, "ok", 5);
        let afterCount = 0;
        let afterError: any;
        const loader = new AsyncLoader(fn, {
            autostart: false,
            retry: 5,
            retryDelay: 200,
            onAfterLoad: (_r, e) => {
                afterCount++;
                afterError = e;
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
        expect(afterCount).toBe(1);
        expect(afterError).toBeInstanceOf(AbortError);
    });

    test("回调内部抛错被忽略，不影响加载主流程", async () => {
        const { fn } = createLoader("data", 10);
        const loader = new AsyncLoader(fn, {
            autostart: false,
            onBeforeLoad: () => {
                throw new Error("before boom");
            },
            onAfterLoad: () => {
                throw new Error("after boom");
            },
        });
        // 回调抛错不应影响加载流程
        const result = await loader.get();
        expect(result).toBe("data");
        expect(loader.signal.isFulfilled()).toBeTrue();
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
        const l1 = new AsyncLoader(fn, { hash: "rt", multiplex: "share", retry: 5, retryDelay: 200 });
        await delay(20); // 进入重试等待
        expect(l1.loading).toBeTrue();

        const l2 = new AsyncLoader(fn, { hash: "rt", multiplex: "share", retry: 5, retryDelay: 200 });
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
        const l1 = new AsyncLoader(a.fn, { multiplex: "restart", hash: "manual", autostart: false });
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
        const loader = new AsyncLoader(fn, { autostart: false, timeout: 30, defaultValue: "fallback" });
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
        const loader = new AsyncLoader(fn, { autostart: false, retry: 1, defaultValue: "fallback" });
        const result = await loader.get();
        expect(result).toBe("fallback");
        expect(getCalls()).toBe(2); // 初始 + 1 次重试
    });
});
