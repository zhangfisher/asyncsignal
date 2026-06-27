# AsyncSignal

可复用的异步信号，类似 `Promise.withResolvers()`，但提供了更强大的异步操作管理功能。

[English](./readme.md)

## 特性

- **信号控制**：创建可手动 resolve 或 reject 的可复用异步信号
- **静态方法**：使用 `asyncSignal.resolve()` 和 `asyncSignal.reject()` 创建预解析或预拒绝的信号
- **时间戳跟踪**：自动记录信号被完成、拒绝或中止时的时间戳
- **元数据存储**：内置元数据对象，用于存储自定义数据和追踪信息
- **超时支持**：为异步操作内置超时功能
- **约束函数**：添加条件逻辑来控制信号何时可以 resolve
- **中止支持**：与 AbortController 原生集成，支持取消操作
- **中止行为控制**：精确控制何时中止 AbortController
- **外部信号联动**：支持传入外部 AbortSignal，信号中止时自动联动 abort 当前异步信号
- **自动重置**：可选的信号自动重置功能（默认：需要手动重置）

## 安装

```bash
pnpm add asyncsignal
# 或
npm install asyncsignal
# 或
yarn add asyncsignal
# 或
bun add asyncsignal
```

## 基础用法

### 创建信号

```typescript
import { asyncSignal } from "asyncsignal";

// 创建基本信号
const signal = asyncSignal();

// 等待信号 resolve
await signal();

// Resolve 信号
signal.resolve("resolved value");

// 或 reject 信号
signal.reject(new Error("rejected error"));
```

### 静态方法

创建已预解析或预拒绝的信号：

```typescript
// 创建一个已解析的信号
const resolvedSignal = asyncSignal.resolve("成功");
console.log(resolvedSignal.isFulfilled()); // true
console.log(resolvedSignal.result); // '成功'

// 创建一个已拒绝的信号
const rejectedSignal = asyncSignal.reject("错误");
console.log(rejectedSignal.isRejected()); // true
console.log(rejectedSignal.error?.message); // '错误'

// 用于提供默认值
const defaultValue = asyncSignal.resolve({ count: 0, data: [] });
```

**实际应用 - 提供回退值：**

```typescript
function fetchWithFallback(url: string) {
    const signal = asyncSignal();

    fetch(url)
        .then(response => response.json())
        .then(data => signal.resolve(data))
        .catch(() => {
            // 出错时使用回退值
            const fallback = asyncSignal.resolve({ error: "获取失败", data: null });
            signal.resolve(fallback.result);
        });

    return signal;
}
```

**实际应用 - 测试和模拟：**

```typescript
// 测试成功场景
async function testSuccess() {
    const mockSignal = asyncSignal.resolve({ id: 1, name: "测试" });
    const result = await mockSignal();
    console.log(result); // { id: 1, name: "测试" }
}

// 测试错误场景
async function testError() {
    const mockSignal = asyncSignal.reject("网络错误");
    try {
        await mockSignal();
    } catch (error) {
        console.log((error as Error).message); // '网络错误'
    }
}
```

### 超时支持

```typescript
const signal = asyncSignal();

// 带超时的等待（100ms 后自动 resolve）
await signal({ timeout: 100 });

// 带超时和自定义错误的等待
await signal({ timeout: 100, returns: new Error("Timeout error") });
```

### 状态检查

```typescript
const signal = asyncSignal();

signal.isPending(); // 如果在等待中则返回 true
signal.isFulfilled(); // 如果已 resolve 则返回 true
signal.isRejected(); // 如果已 reject 则返回 true
```

### 结果访问

信号提供直接访问其 resolve 值和 reject 错误的功能：

```typescript
const signal = asyncSignal<string>();

// Resolve 并访问结果
signal.resolve("成功");
await signal();

console.log(signal.result); // '成功'
console.log(signal.error); // undefined
console.log(signal.timestamp); // 1234567890 - 信号完成时的时间戳

// Reject 并访问错误
signal.reject(new Error("失败"));

console.log(signal.result); // undefined
console.log(signal.error); // Error: 失败
console.log(signal.timestamp); // 1234567891 - 信号被拒绝时的时间戳

// 无需等待即可访问
const signal2 = asyncSignal<number>();
signal2.resolve(42);

console.log(signal2.result); // 42 - 立即可用
console.log(signal2.error); // undefined
console.log(signal2.timestamp); // 1234567892 - 信号完成时的时间戳

// 等待中的信号时间戳为 0
const signal3 = asyncSignal();
console.log(signal3.timestamp); // 0 - 尚未完成或被拒绝
```

### 元数据存储

每个信号都有一个 `meta` 对象用于存储自定义元数据：

```typescript
const signal = asyncSignal();

// 存储自定义数据
signal.meta.userId = "12345";
signal.meta.requestId = "abc-123";
signal.meta.attempts = 1;
signal.meta.tags = ["重要", "紧急"];

// 追踪生命周期事件
signal.meta.createdAt = Date.now();
signal.meta.status = "等待中";

signal.resolve("成功");
await signal();

signal.meta.status = "已完成";
signal.meta.completedAt = signal.timestamp;

// 元数据在 reset 时保留
signal.reset();
console.log(signal.meta.userId); // "12345" - 仍然可用
console.log(signal.meta.attempts); // 1 - 被保留

// 更新以进行重试
signal.meta.attempts = 2;
```

**类型安全的元数据（使用泛型）：**

您可以使用第二个泛型参数为元数据指定类型：

```typescript
interface RequestMetadata {
    requestId: string;
    userId: string;
    attemptNumber: number;
    maxRetries: number;
}

// 创建具有类型化元数据的信号
const signal = asyncSignal<string, RequestMetadata>();

// TypeScript 现在知道 meta 的确切类型
signal.meta.requestId = "req-123";      // ✅ 类型安全
signal.meta.userId = "user-456";         // ✅ 类型安全
signal.meta.attemptNumber = 1;           // ✅ 类型安全
signal.meta.maxRetries = 3;              // ✅ 类型安全
// signal.meta.invalidField = "test";    // ❌ 类型错误

// 也适用于静态方法
const resolved = asyncSignal.resolve<string, RequestMetadata>("成功");
resolved.meta.requestId = "req-456";     // ✅ 类型安全

const rejected = asyncSignal.reject<string, RequestMetadata>("错误");
rejected.meta.attemptNumber = 2;         // ✅ 类型安全
```

### 信号重置

默认情况下，信号需要手动重置才能复用：

```typescript
const signal = asyncSignal();

await signal(); // 第一次使用
await signal(); // 返回相同的已完成 promise
signal.reset(); // 重置以便复用
await signal(); // 可以再次使用
```

## 高级用法

### Until 函数

添加信号可以 resolve 之前必须满足的条件：

```typescript
let ready = false;
const signal = asyncSignal({ until: () => ready });

// 在 ready 为 true 之前不会 resolve
signal.resolve(); // 会被条件阻塞

ready = true;
signal.resolve(); // 现在可以 resolve 了
```

### 自动重置选项

控制信号完成后是否自动重置。默认情况下，`autoReset` 为 `false`，意味着您需要手动调用 `signal.reset()` 来复用信号：

```typescript
// 禁用自动重置（默认）
const signal1 = asyncSignal();
await signal1(); // 第一次使用
await signal1(); // 返回相同的已完成 promise
signal1.reset(); // 必须手动重置才能复用
await signal1(); // 现在可以再次使用

// 启用自动重置
const signal2 = asyncSignal({ autoReset: true });
await signal2(); // 完成后自动重置
await signal2(); // 无需手动重置即可再次使用
```

### 中止行为控制

使用 `abortAt` 选项控制何时中止 `AbortController`：

```typescript
// 默认：在 resolve、reject 和 reset 时都中止
const signal1 = asyncSignal({ abortAt: "all" });

// 仅在 reject 时中止（适用于网络请求）
const signal2 = asyncSignal({ abortAt: "reject" });

// 仅在 resolve 时中止（适用于资源清理）
const signal3 = asyncSignal({ abortAt: "resolve" });

// 从不自动中止（手动控制）
const signal4 = asyncSignal({ abortAt: "none" });
```

#### 使用场景

**网络请求取消（仅在错误时中止）：**

```typescript
const signal = asyncSignal({ abortAt: "reject" });
const abortSignal = signal.getAbortSignal();

async function fetchData() {
    try {
        const response = await fetch("/api/data", { signal: abortSignal! });
        signal.resolve("成功");
        return response;
    } catch (error) {
        signal.reject(error);
        throw error;
    }
}

// 成功时：fetch 完成，不中止
// 失败时：同时中止信号和 fetch 请求
```

**资源清理（仅在成功时中止）：**

```typescript
const signal = asyncSignal({ abortAt: "resolve" });
const abortSignal = signal.getAbortSignal();

abortSignal.addEventListener("abort", () => {
    清理临时文件();
});

// 信号在成功时会中止并清理，但失败时不会
```

### 外部信号联动

通过 `abortSignal` 选项传入一个外部 AbortSignal，当外部信号中止时自动联动 abort 当前异步信号（传入已中止的信号会被忽略）：

```typescript
const controller = new AbortController();
const signal = asyncSignal({ abortSignal: controller.signal });

const promise = signal();
// 外部中止时，signal 会被联动 abort（reject 一个 AbortError）
controller.abort();
```

也可以在每次 `signal()` 调用时传入 per-call 的 `abortSignal`，行为与构造选项一致：

```typescript
const controller = new AbortController();
const signal = asyncSignal();

// 仅本次等待受 controller 控制
await signal({ abortSignal: controller.signal });
controller.abort(); // 联动 abort 当前 signal
```

### Abort 集成

与 AbortController 无缝协作：

```typescript
const signal = asyncSignal();

// 获取用于 fetch 调用的 abort signal
const abortSignal = signal.getAbortSignal();

fetch("/api/data", { signal: abortSignal });

// Abort 会同时 reject 信号和 fetch 请求
signal.abort();
```

### 信号销毁

清理信号并 reject 等待中的操作：

```typescript
const signal = asyncSignal();

// 信号将被 reject 并抛出 AbortError
signal.destroy();

// 后续的 await 将抛出 AbortError
try {
    await signal();
} catch (error) {
    console.log(error.name); // 'AbortError'
}
```

## 实际应用示例

### 手动事件等待

```typescript
function waitForEvent(element: string, event: string) {
    const signal = asyncSignal();

    document.querySelector(element).addEventListener(
        event,
        () => {
            signal.resolve();
        },
        { once: true },
    );

    return signal({ timeout: 5000, returns: new Error("Event timeout") });
}

// 等待点击事件
await waitForEvent("#button", "click");
```

### 条件操作

```typescript
function waitForCondition(condition: () => boolean, timeout = 5000) {
    // 启用 autoReset 以进行多次条件检查
    const signal = asyncSignal({ until: condition, autoReset: true });

    const interval = setInterval(() => {
        if (signal.resolve()) {
            clearInterval(interval);
        }
    }, 100);

    return signal({ timeout, returns: new Error("Condition not met") });
}
```

## API 参考

### asyncSignal()

```typescript
function asyncSignal<T = any, M extends Record<string, any> = Record<string, any>>(options?: AsyncSignalOptions): IAsyncSignal<T, M>;
```

**静态方法：**

- `asyncSignal.resolve<T, M>(result?: T): IAsyncSignal<T, M>` - 创建一个已解析的信号
- `asyncSignal.reject<T, M>(error?: Error | string): IAsyncSignal<T, M>` - 创建一个已拒绝的信号

**参数：**

- `options` - 配置选项
    - `until` - 可选函数，必须返回 true 才能 resolve 成功
    - `autoReset` - 完成后自动重置信号（默认：false）
    - `abortAt` - 控制何时中止 AbortController（默认：'all'）
        - `'all'` - 在 resolve、reject 和 reset 时都中止
        - `'reject'` - 仅在 reject 时中止
        - `'resolve'` - 仅在 resolve 时中止
        - `'none'` - 从不自动中止
    - `abortSignal` - 可选的外部 AbortSignal，中止时联动 abort 当前信号（传入已中止的信号会被忽略）

**返回：** `IAsyncSignal` - 包含方法和属性的信号对象

### IAsyncSignal 接口

```typescript
interface IAsyncSignal<T = any, M extends Record<string, any> = Record<string, any>> {
    (args?: AsyncSignalArgs): Promise<T>;
    id: number;
    reset(): void;
    reject(e?: Error | string): void;
    resolve(result?: T): void;
    destroy(): void;
    isFulfilled(): boolean;
    isRejected(): boolean;
    isPending(): boolean;
    abort(): void;
    getAbortSignal(): AbortSignal;
    result: T | undefined;
    error: any;
}
```

**属性说明：**

- `result` - resolve 的值（未 resolve 或 reject 时为 undefined）
- `error` - reject 的错误信息（未 reject 或 resolve 时为 undefined）
- `timestamp` - 信号被完成、拒绝或中止时的时间戳（毫秒，从纪元开始）。如果信号还在等待中，返回 0。
- `meta` - 元数据对象，用于存储自定义数据。在 reset/destroy 操作后仍然保留。

**访问结果示例：**

```typescript
const signal = asyncSignal<string>();
signal.resolve("成功");
await signal();

console.log(signal.result); // '成功'
console.log(signal.error); // undefined

// reject 后
signal.reject(new Error("失败"));
console.log(signal.result); // undefined
console.log(signal.error); // Error: 失败
```

**方法说明：**

- `signal(args?)` - 等待信号 resolve 或 reject，`args` 为 `AsyncSignalArgs` 对象：
    - `timeout` - 超时时间（毫秒），>0 时启用超时自动结算
    - `returns` - 超时结算值；为 Error 实例时按 reject 处理，否则按 resolve 处理
    - `abortSignal` - 可选的外部 AbortSignal，中止时联动 abort 当前 signal
- `id` - 信号的唯一标识符
- `reset()` - 重置信号以便复用
- `reject(e?)` - Reject 信号
- `resolve(result?)` - Resolve 信号
- `destroy()` - 销毁信号并 reject 等待中的操作
- `isFulfilled()` - 检查是否已 resolved
- `isRejected()` - 检查是否已 rejected
- `isPending()` - 检查是否正在等待
- `abort()` - 中止信号操作
- `getAbortSignal()` - 获取 AbortController 的 signal

## AsyncLoader

基于 AsyncSignal 的异步数据加载器，封装「加载 + 缓存 + 中止 + 超时 + 重试」五类能力。底层加载函数通过 `args.abortSignal` 接收合并后的中止信号，可直接传入 `fetch` 的 `signal` 选项。

### 特性

- **自动/懒加载**：`autostart` 默认 `true`，构造即加载；设为 `false` 时首次 `get()` 才触发
- **缓存**：`cache>0` 时按 `hash` 缓存结果，过期后 `get()` 自动重新加载
- **中止**：`abort()` 借内部信号链路穿透到底层请求
- **每次尝试独立超时**：`timeout>0` 为每次尝试设置超时，超时算作可重试的失败
- **失败自动重试**：`retry>0` 对超时与业务错误自动重试；主动 abort 不重试

### 基本用法

```typescript
import { AsyncLoader } from "asyncsignal";

// 构造函数第一个参数 loader 为底层加载函数
const loader = new AsyncLoader((args) =>
    fetch("/api/data", { signal: args.abortSignal }).then((r) => r.json())
);

const data = await loader.get();  // 获取结果（命中有效缓存则直接返回）
loader.abort();                    // 中止加载
```

### 构造选项（AsyncLoaderOptions）

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `autostart` | `boolean` | `true` | 是否构造时自动加载；设为 `false` 改为首次 `get()` 懒触发 |
| `cache` | `number` | `0` | 缓存有效期（毫秒）。`=0` 不缓存，`>0` 为有效期 |
| `hash` | `string` | 自动生成 | 加载任务的唯一标识（hash），兼作缓存键；`cache>0` 但未提供时自动生成实例级 hash |
| `abortSignal` | `AbortSignal` | — | 外部中止信号，触发时联动中止加载（且不会触发重试） |
| `timeout` | `number` | — | 每次尝试的超时（毫秒），`>0` 生效；超时视为一次可重试的失败 |
| `retry` | `number` | `0` | 失败后的最大重试次数。主动 abort 不重试，超时与业务错误会重试 |
| `retryDelay` | `number` | `0` | 每次重试前的等待毫秒数 |
| `onBeforeLoad` | `() => void` | — | 加载开始前调用（仅实际加载时，缓存命中不触发）；回调内抛错会被忽略 |
| `onAfterLoad` | `(result?, error?) => void` | — | 加载结束后调用（成功带 `result`，失败/中止带 `error`），缓存命中不触发；回调内抛错会被忽略 |

### 缓存

启用缓存后，相同 `hash` 的结果在有效期内复用，过期后自动重新加载：

```typescript
const loader = new AsyncLoader(
    (args) => fetch("/api/data", { signal: args.abortSignal }).then((r) => r.json()),
    { cache: 60_000, hash: "data" }   // 缓存 60 秒
);

await loader.get();  // 首次加载并写入缓存
await loader.get();  // 命中缓存，不调用底层

loader.clear();         // 清除当前实例缓存
AsyncLoader.clearAll(); // 清除所有缓存
```

### 中止与超时

```typescript
const loader = new AsyncLoader(
    (args) => fetch("/api/data", { signal: args.abortSignal }),
    { timeout: 5_000 }   // 每次尝试 5 秒超时
);

loader.abort();  // 中止正在进行的请求，穿透到底层 fetch
```

超时与主动中止的错误类型不同：
- **超时**最终失败（重试耗尽或未启用重试）→ reject `TimeoutError`；
- **主动 `abort()` / 外部 `abortSignal`** → reject `AbortError`；
- 业务错误 → 透传原始错误。

### 重试

`retry` 对超时和业务失败自动重试；主动 abort（`abort()` 或外部 `abortSignal`）不会重试：

```typescript
const loader = new AsyncLoader(
    (args) => fetch("/api/data", { signal: args.abortSignal }),
    {
        timeout: 5_000,     // 每次尝试 5 秒
        retry: 3,           // 最多重试 3 次（总共最多 4 次尝试）
        retryDelay: 1_000,  // 每次重试前等待 1 秒
    }
);
```

### API 参考

**构造函数：**

```typescript
new AsyncLoader<T>(loader: (args: AsyncLoaderArgs) => Promise<T>, options?: AsyncLoaderOptions)
```

**实例方法：**

| 方法 | 说明 |
| --- | --- |
| `get(args?)` | 获取加载结果；首次/缓存失效/上次失败时自动触发加载。`args` 透传给内部 signal（`timeout` 为等待超时，与 `options.timeout` 加载超时语义不同） |
| `load()` | 触发一次加载（通常无需手动调用，`get()` 会自动触发） |
| `abort()` | 中止加载，穿透到底层请求；处于重试等待中时一并终止 |
| `clear()` | 清除当前实例的缓存项 |

**静态方法：**

| 方法 | 说明 |
| --- | --- |
| `AsyncLoader.clearAll()` | 清除所有实例共享的全部缓存项 |

**实例属性：**

| 属性 | 说明 |
| --- | --- |
| `signal` | 内部承载结果的 `IAsyncSignal`，可观察状态与 `result` / `error` |
| `loading` | 是否正在加载（含重试过程） |
| `options` | 合并默认值后的构造选项 |

## 开源项目

以下项目使用了 AsyncSignal：

- [VoerkaI18n](https://zhangfisher.github.io/voerka-i18n/) - 全流程一键化 React/Vue/Nodejs 国际化方案
- [AutoStore](https://zhangfisher.github.io/autostore/) - 自动化存储管理
- [Logsets](https://zhangfisher.github.io/logsets/) - 终端界面开发增强库
- [VoerkaLogger](https://zhangfisher.github.io/voerkaloger/) - 简单的日志输出库
- [FlexDecorators](https://zhangfisher.github.io/flex-decorators/) - 装饰器开发工具
- [FlexState](https://zhangfisher.github.io/flexstate/) - 有限状态机库
- [FlexTools](https://zhangfisher.github.io/flex-tools/) - 通用函数工具库
- [Styledfc](https://zhangfisher.github.io/styledfc/) - 小巧优雅的 CSS-IN-JS 库
- [json_comments_extension](https://github.com/zhangfisher/json_comments_extension) - 为 JSON 文件添加注释的 VSCODE 插件
- [mixed-cli](https://github.com/zhangfisher/mixed-cli) - 开发交互式命令行程序库
- [flexvars](https://github.com/zhangfisher/flexvars) - 强大的字符串插值变量处理工具库
- [yald](https://github.com/zhangfisher/yald) - 前端 link 调试辅助工具

## 许可证

MIT
