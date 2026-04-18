# AsyncSignal

可复用的异步信号，类似 `Promise.withResolvers()`，但提供了更强大的异步操作管理功能。

[English](./readme.md)

## 特性

- **信号控制**：创建可手动 resolve 或 reject 的可复用异步信号
- **超时支持**：为异步操作内置超时功能
- **约束函数**：添加条件逻辑来控制信号何时可以 resolve
- **信号管理**：使用 AsyncSignalManager 批量管理多个信号
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
```

## 基础用法

### 创建信号

```typescript
import { asyncSignal } from 'asyncsignal';

// 创建基本信号
const signal = asyncSignal();

// 等待信号 resolve
await signal();

// Resolve 信号
signal.resolve('resolved value');

// 或 reject 信号
signal.reject(new Error('rejected error'));
```

### 超时支持

```typescript
const signal = asyncSignal();

// 带超时的等待（100ms 后自动 resolve）
await signal(100);

// 带超时和自定义错误的等待
await signal(100, new Error('Timeout error'));
```

### 状态检查

```typescript
const signal = asyncSignal();

signal.isPending();    // 如果在等待中则返回 true
signal.isResolved();   // 如果已 resolve 则返回 true
signal.isRejected();   // 如果已 reject 则返回 true
```

### 信号重置

默认情况下，信号需要手动重置才能复用：

```typescript
const signal = asyncSignal();

await signal();        // 第一次使用
await signal();        // 返回相同的已完成 promise
signal.reset();        // 重置以便复用
await signal();        // 可以再次使用
```

## 高级用法

### 约束函数

添加信号可以 resolve 之前必须满足的条件：

```typescript
let ready = false;
const signal = asyncSignal(() => ready);

// 在 ready 为 true 之前不会 resolve
signal.resolve(); // 会被约束条件阻塞

ready = true;
signal.resolve(); // 现在可以 resolve 了
```

### 自动重置选项

控制信号完成后是否自动重置。默认情况下，`autoReset` 为 `false`，意味着您需要手动调用 `signal.reset()` 来复用信号：

```typescript
// 禁用自动重置（默认）
const signal1 = asyncSignal();
await signal1();        // 第一次使用
await signal1();        // 返回相同的已完成 promise
signal1.reset();        // 必须手动重置才能复用
await signal1();        // 现在可以再次使用

// 启用自动重置
const signal2 = asyncSignal(undefined, { autoReset: true });
await signal2();        // 完成后自动重置
await signal2();        // 无需手动重置即可再次使用
```

### 中止行为控制

使用 `abortBehavior` 选项控制何时中止 `AbortController`：

```typescript
// 默认：在 resolve、reject 和 reset 时都中止
const signal1 = asyncSignal(undefined, { abortBehavior: 'all' });

// 仅在 reject 时中止（适用于网络请求）
const signal2 = asyncSignal(undefined, { abortBehavior: 'reject' });

// 仅在 resolve 时中止（适用于资源清理）
const signal3 = asyncSignal(undefined, { abortBehavior: 'resolve' });

// 从不自动中止（手动控制）
const signal4 = asyncSignal(undefined, { abortBehavior: 'none' });
```

#### 使用场景

**网络请求取消（仅在错误时中止）：**
```typescript
const signal = asyncSignal(undefined, { abortBehavior: 'reject' });
const abortSignal = signal.getAbortSignal();

async function fetchData() {
  try {
    const response = await fetch('/api/data', { signal: abortSignal! });
    signal.resolve('成功');
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
const signal = asyncSignal(undefined, { abortBehavior: 'resolve' });
const abortSignal = signal.getAbortSignal();

abortSignal.addEventListener('abort', () => {
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

fetch('/api/data', { signal: abortSignal });

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

## AsyncSignalManager

使用批量操作管理多个信号：

```typescript
import { AsyncSignalManager } from 'asyncsignal';

// 创建带默认超时的管理器
const manager = new AsyncSignalManager({
  timeout: 60000 // 1分钟默认超时
});

// 通过管理器创建信号
const signal1 = manager.create();
const signal2 = manager.create();

// 批量操作
manager.resolve('all resolved');      // Resolve 所有信号
manager.reject(new Error('failed'));  // Reject 所有信号
manager.reset();                      // 重置所有信号

// 销毁指定信号
manager.destroy(signal1.id);

// 销毁所有信号
manager.destroy();
```

### 管理器使用场景

- **并行操作**：协调多个异步任务
- **资源管理**：一次性清理多个信号
- **批量操作**：同时 resolve/reject 多个操作
- **超时控制**：为所有操作设置一致的超时时间

## 实际应用示例

### 手动事件等待

```typescript
function waitForEvent(element: string, event: string) {
  const signal = asyncSignal();
  
  document.querySelector(element).addEventListener(event, () => {
    signal.resolve();
  }, { once: true });
  
  return signal(5000, new Error('Event timeout'));
}

// 等待点击事件
await waitForEvent('#button', 'click');
```

### 异步任务队列

```typescript
const manager = new AsyncSignalManager({ timeout: 30000 });

function processTasks(tasks: any[]) {
  const signals = tasks.map(() => manager.create());
  
  tasks.forEach((task, index) => {
    processTask(task)
      .then(result => signals[index].resolve(result))
      .catch(error => signals[index].reject(error));
  });
  
  return Promise.all(signals.map(s => s()));
}
```

### 条件操作

```typescript
function waitForCondition(condition: () => boolean, timeout = 5000) {
  // 启用 autoReset 以进行多次条件检查
  const signal = asyncSignal(condition, { timeout, autoReset: true });
  
  const interval = setInterval(() => {
    if (signal.resolve()) {
      clearInterval(interval);
    }
  }, 100);
  
  return signal(timeout, new Error('Condition not met'));
}
```

## API 参考

### asyncSignal()

```typescript
function asyncSignal(
  constraint?: () => boolean,
  options?: AsyncSignalOptions
): IAsyncSignal
```

**参数：**
- `constraint` - 可选函数，必须返回 true 才能 resolve 成功
- `options` - 配置选项
  - `timeout` - 默认超时时间（毫秒）（默认：0）
  - `autoReset` - 完成后自动重置信号（默认：false）
  - `abortBehavior` - 控制何时中止 AbortController（默认：'all'）
    - `'all'` - 在 resolve、reject 和 reset 时都中止
    - `'reject'` - 仅在 reject 时中止
    - `'resolve'` - 仅在 resolve 时中止
    - `'none'` - 从不自动中止

**返回：** `IAsyncSignal` - 包含方法和属性的信号对象

### IAsyncSignal 接口

```typescript
interface IAsyncSignal {
  (timeout?: number, returns?: any): Promise<any>;
  id: number;
  reset(): void;
  reject(e?: Error | string): void;
  resolve(result?: any): void;
  destroy(): void;
  isResolved(): boolean;
  isRejected(): boolean;
  isPending(): boolean;
  abort(): void;
  getAbortSignal(): AbortSignal;
}
```

**方法说明：**

- `signal(timeout?, returns?)` - 等待信号 resolve 或 reject
- `id` - 信号的唯一标识符
- `reset()` - 重置信号以便复用
- `reject(e?)` - Reject 信号
- `resolve(result?)` - Resolve 信号
- `destroy()` - 销毁信号并 reject 等待中的操作
- `isResolved()` - 检查是否已 resolved
- `isRejected()` - 检查是否已 rejected
- `isPending()` - 检查是否正在等待
- `abort()` - 中止信号操作
- `getAbortSignal()` - 获取 AbortController 的 signal

### AsyncSignalManager

```typescript
class AsyncSignalManager {
  constructor(options?: { timeout: number });
  create(constraint?: () => boolean): IAsyncSignal;
  destroy(id?: number | number[]): void;
  resolve(...args: any[]): void;
  reject(e?: Error | string): void;
  reset(): void;
}
```

**方法说明：**
- `constructor(options)` - 创建管理器，可设置默认超时
- `create(constraint?)` - 创建新的异步信号
- `destroy(id?)` - 销毁指定或所有信号
- `resolve(...args)` - Resolve 所有信号
- `reject(e?)` - Reject 所有信号
- `reset()` - 重置所有信号

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
