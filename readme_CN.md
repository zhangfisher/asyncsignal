# AsyncSignal

可复用的异步信号，类似 `Promise.withResolvers()`，但提供了更强大的异步操作管理功能。

[English](./readme.md)

## 特性

- **信号控制**：创建可手动 resolve 或 reject 的可复用异步信号
- **静态方法**：使用 `asyncSignal.resolve()` 和 `asyncSignal.reject()` 创建预解析或预拒绝的信号
- **超时支持**：为异步操作内置超时功能
- **约束函数**：添加条件逻辑来控制信号何时可以 resolve
- **中止支持**：与 AbortController 原生集成，支持取消操作
- **中止行为控制**：精确控制何时中止 AbortController
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
await signal(100);

// 带超时和自定义错误的等待
await signal(100, new Error("Timeout error"));
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

// Reject 并访问错误
signal.reject(new Error("失败"));

console.log(signal.result); // undefined
console.log(signal.error); // Error: 失败

// 无需等待即可访问
const signal2 = asyncSignal<number>();
signal2.resolve(42);

console.log(signal2.result); // 42 - 立即可用
console.log(signal2.error); // undefined
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

    return signal(5000, new Error("Event timeout"));
}

// 等待点击事件
await waitForEvent("#button", "click");
```

### 条件操作

```typescript
function waitForCondition(condition: () => boolean, timeout = 5000) {
    // 启用 autoReset 以进行多次条件检查
    const signal = asyncSignal({ until: condition, timeout, autoReset: true });

    const interval = setInterval(() => {
        if (signal.resolve()) {
            clearInterval(interval);
        }
    }, 100);

    return signal(timeout, new Error("Condition not met"));
}
```

## API 参考

### asyncSignal()

```typescript
function asyncSignal(options?: AsyncSignalOptions): IAsyncSignal;
```

**静态方法：**

- `asyncSignal.resolve<T>(result?: T): IAsyncSignal<T>` - 创建一个已解析的信号
- `asyncSignal.reject<T>(error?: Error | string): IAsyncSignal<T>` - 创建一个已拒绝的信号

**参数：**

- `options` - 配置选项
    - `until` - 可选函数，必须返回 true 才能 resolve 成功
    - `timeout` - 默认超时时间（毫秒）（默认：0）
    - `autoReset` - 完成后自动重置信号（默认：false）
    - `abortAt` - 控制何时中止 AbortController（默认：'all'）
        - `'all'` - 在 resolve、reject 和 reset 时都中止
        - `'reject'` - 仅在 reject 时中止
        - `'resolve'` - 仅在 resolve 时中止
        - `'none'` - 从不自动中止

**返回：** `IAsyncSignal` - 包含方法和属性的信号对象

### IAsyncSignal 接口

```typescript
interface IAsyncSignal<T = any> {
    (timeout?: number, returns?: T): Promise<T>;
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

- `signal(timeout?, returns?)` - 等待信号 resolve 或 reject
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
