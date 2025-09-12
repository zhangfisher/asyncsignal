# AsyncSignal

一个用于 JavaScript/TypeScript 应用的可复用异步信号库。

[English](./readme.md)

## 安装

```ts
pnpm add asyncsignal
// 或者
npm install asyncsignal
// 或者
yarn add asyncsignal
```

## 特性

- 🚦 **可复用信号**: 创建可以在重置后重复使用的异步信号
- 🔒 **约束条件**: 支持添加必须满足的条件才能解析信号
- ⏱️ **超时控制**: 为信号解析设置超时时间，支持自定义超时行为
- 🎯 **信号状态**: 跟踪信号状态（等待中、已解析、已拒绝）
- 🎮 **信号管理**: 使用 AsyncSignalManager 统一管理多个信号
- 🔄 **重置能力**: 将信号重置到初始状态以便重复使用
- 💪 **TypeScript 支持**: 完整的 TypeScript 类型定义支持

## 使用方法

### 基础用法

```ts
import { asyncSignal } from "asyncsignal";

// 创建一个基础信号
const signal = asyncSignal();

// 等待信号解析
await signal();

// 解析信号
signal.resolve("成功");

// 拒绝信号
signal.reject(new Error("发生错误"));

// 重置信号以便重用
signal.reset();
```

### 高级特性

#### 约束函数

```ts
// 只有当约束函数返回true时，信号才会被解析
const signal = asyncSignal(() => someCondition === true);

// 当约束条件不满足时，尝试解析会被忽略
signal.resolve(); // 只有当someCondition === true时才会解析
```

#### 超时控制

```ts
// 创建带默认超时的信号
const signal = asyncSignal(undefined, { timeout: 1000 });

// 等待信号，设置超时和默认值
await signal(2000); // 将在2秒后自动解析

// 等待信号，设置超时和错误处理
await signal(2000, new Error("发生超时")); // 将在2秒后抛出错误
```

#### 订阅事件

```ts
import { asyncSignal } from "asyncsignal";
const signal = asyncSignal();
// 当信号resolve/reject时触发,reset后保持有效
signal.on((e?: Error, result?: any) => {});
// 当信号resolve/reject时触发，只触发一次,reset后失效
signal.once((e?: Error, result?: any) => {});
```

#### 状态检查

```ts
const signal = asyncSignal();

console.log(signal.isPending()); // 创建后为true
console.log(signal.isResolved()); // 解析后为true
console.log(signal.isRejected()); // 拒绝后为true
```

### 错误处理

```ts
import { asyncSignal, AsyncSignalAbort } from "asyncsignal";

// 处理信号销毁时的错误
const signal = asyncSignal();
try {
  await signal();
} catch (error) {
  if (error instanceof AsyncSignalAbort) {
    console.log("信号已被销毁");
  }
}
```

### 实现细节

- 信号状态是互斥的（等待中、已解析、已拒绝）
- 对非等待状态的信号调用`resolve()`或`reject()`会被忽略
- 当约束函数返回 false 时调用`resolve()`会被静默忽略
- `destroy()`方法会使用 AsyncSignalAbort 错误拒绝处于等待状态的信号

### 管理多个信号

```ts
import { AsyncSignalManager } from "asyncsignal";

// 创建一个带默认超时的信号管理器
const manager = new AsyncSignalManager({ timeout: 5000 });

// 创建多个信号
const signal1 = manager.create();
const signal2 = manager.create(() => someCondition);

// 解析所有信号，可以传入可选值
manager.resolve("成功");

// 拒绝所有信号
manager.reject(new Error("批量操作失败"));

// 重置所有信号以便重用
manager.reset();

// 销毁特定信号
manager.destroy(signal1.id);

// 销毁多个信号
manager.destroy([signal1.id, signal2.id]);

// 销毁所有信号
manager.destroy();
```

## 开源项目

- [全流程一健化 React/Vue/Nodejs 国际化方案 - VoerkaI18n](https://zhangfisher.github.io/voerka-i18n/)
- [无以伦比的 Reac 状态管理库 - AutoStore](https://zhangfisher.github.io/autostore/)
- [终端界面开发增强库 - Logsets](https://zhangfisher.github.io/logsets/)
- [简单的日志输出库 - VoerkaLogger](https://zhangfisher.github.io/voerkalogger/)
- [装饰器开发 - FlexDecorators](https://zhangfisher.github.io/flex-decorators/)
- [有限状态机库 - FlexState](https://zhangfisher.github.io/flexstate/)
- [通用函数工具库 - FlexTools](https://zhangfisher.github.io/flex-tools/)
- [小巧优雅的 CSS-IN-JS 库 - Styledfc](https://zhangfisher.github.io/styledfc/)
- [为 JSON 文件添加注释的 VSCODE 插件 - json_comments_extension](https://github.com/zhangfisher/json_comments_extension)
- [开发交互式命令行程序库 - mixed-cli](https://github.com/zhangfisher/mixed-cli)
- [强大的字符串插值变量处理工具库 - flexvars](https://github.com/zhangfisher/flexvars)
- [前端 link 调试辅助工具 - yald](https://github.com/zhangfisher/yald)
