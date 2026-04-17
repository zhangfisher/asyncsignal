# abortBehavior 选项

`asyncSignal` 现在支持 `abortBehavior` 选项来控制何时中止 `AbortController`。

## 选项值

- `'all'` (默认): 在 `resolve`、`reject`、`reset` 时都会中止 `AbortController`
- `'reject'`: 仅在 `reject` 时中止 `AbortController`
- `'resolve'`: 仅在 `resolve` 时中止 `AbortController`
- `'none'`: 从不自动中止 `AbortController`

## 使用示例

```typescript
import { asyncSignal } from 'asyncsignal';

// 默认行为 - 所有操作都会中止
const signal1 = asyncSignal(undefined, { abortBehavior: 'all' });

// 仅在错误时中止 - 适用于网络请求取消
const signal2 = asyncSignal(undefined, { abortBehavior: 'reject' });

// 仅在成功时中止 - 适用于资源清理
const signal3 = asyncSignal(undefined, { abortBehavior: 'resolve' });

// 从不自动中止 - 手动控制
const signal4 = asyncSignal(undefined, { abortBehavior: 'none' });
```

## 实际应用场景

### 网络请求取消（仅在错误时）

```typescript
const signal = asyncSignal(undefined, { abortBehavior: 'reject' });
const abortSignal = signal.getAbortSignal();

async function fetchData() {
    try {
        const response = await fetch(url, { signal: abortSignal! });
        signal.resolve("成功");
        return response;
    } catch (error) {
        signal.reject(error);
        throw error;
    }
}
```

### 资源清理（仅在成功时）

```typescript
const signal = asyncSignal(undefined, { abortBehavior: 'resolve' });
const abortSignal = signal.getAbortSignal();

// 监听 abort 事件来清理资源
abortSignal.addEventListener("abort", () => {
    cleanupTemporaryFiles();
});
```

## 注意事项

- `destroy()` 和 `abort()` 操作不受 `abortBehavior` 影响，总是会中止 `AbortController`
- `reset()` 会根据 `abortBehavior` 选项决定是否中止
- 使用 `autoReset` 时，每次重置都会根据 `abortBehavior` 决定是否中止
