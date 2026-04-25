# AsyncSignal

Reusable asynchronous signals, like `Promise.withResolvers()` but with more powerful features for managing asynchronous operations.

[中文](./readme_CN.md)

## Features

- **Signal Control**: Create reusable async signals that can be manually resolved or rejected
- **Static Methods**: Create pre-resolved or pre-rejected signals with `asyncSignal.resolve()` and `asyncSignal.reject()`
- **Timestamp Tracking**: Automatic timestamp recording when signals are fulfilled, rejected, or aborted
- **Metadata Storage**: Built-in metadata object for storing custom data and tracking information
- **Timeout Support**: Built-in timeout functionality for async operations
- **Constraint Functions**: Add conditional logic to control when signals can resolve
- **Abort Support**: Native integration with AbortController for cancellation
- **Abort Behavior Control**: Fine-grained control over when to abort AbortController
- **Auto Reset**: Optional automatic signal reset (default: manual reset required)

## Installation

```bash
pnpm add asyncsignal
# or
npm install asyncsignal
# or
yarn add asyncsignal
```

## Basic Usage

### Creating a Signal

```typescript
import { asyncSignal } from "asyncsignal";

// Create a basic signal
const signal = asyncSignal();

// Wait for the signal to resolve
await signal();

// Resolve the signal
signal.resolve("resolved value");

// Or reject the signal
signal.reject(new Error("rejected error"));
```

### Static Methods

Create pre-resolved or pre-rejected signals:

```typescript
// Create a pre-resolved signal
const resolvedSignal = asyncSignal.resolve("success");
console.log(resolvedSignal.isFulfilled()); // true
console.log(resolvedSignal.result); // 'success'

// Create a pre-rejected signal
const rejectedSignal = asyncSignal.reject("error");
console.log(rejectedSignal.isRejected()); // true
console.log(rejectedSignal.error?.message); // 'error'

// Useful for providing default values
const defaultValue = asyncSignal.resolve({ count: 0, data: [] });
```

**Use Case - Fallback Values:**

```typescript
function fetchWithFallback(url: string) {
    const signal = asyncSignal();

    fetch(url)
        .then(response => response.json())
        .then(data => signal.resolve(data))
        .catch(() => {
            // On error, use fallback value
            const fallback = asyncSignal.resolve({ error: "Failed to fetch", data: null });
            signal.resolve(fallback.result);
        });

    return signal;
}
```

**Use Case - Testing and Mocking:**

```typescript
// Test successful scenario
async function testSuccess() {
    const mockSignal = asyncSignal.resolve({ id: 1, name: "Test" });
    const result = await mockSignal();
    console.log(result); // { id: 1, name: "Test" }
}

// Test error scenario
async function testError() {
    const mockSignal = asyncSignal.reject("Network error");
    try {
        await mockSignal();
    } catch (error) {
        console.log((error as Error).message); // 'Network error'
    }
}
```

### Timeout Support

```typescript
const signal = asyncSignal();

// Wait with timeout (resolves after 100ms)
await signal(100);

// Wait with timeout and custom error
await signal(100, new Error("Timeout error"));
```

### Status Checking

```typescript
const signal = asyncSignal();

signal.isPending(); // true if waiting
signal.isFulfilled(); // true if resolved
signal.isRejected(); // true if rejected
```

### Result Access

Signals provide direct access to their resolved values and rejected errors:

```typescript
const signal = asyncSignal<string>();

// Resolve and access result
signal.resolve("success");
await signal();

console.log(signal.result); // 'success'
console.log(signal.error); // undefined
console.log(signal.timestamp); // 1234567890 - timestamp when fulfilled

// Reject and access error
signal.reject(new Error("failed"));

console.log(signal.result); // undefined
console.log(signal.error); // Error: failed
console.log(signal.timestamp); // 1234567891 - timestamp when rejected

// Access without awaiting
const signal2 = asyncSignal<number>();
signal2.resolve(42);

console.log(signal2.result); // 42 - immediately available
console.log(signal2.error); // undefined
console.log(signal2.timestamp); // 1234567892 - timestamp when fulfilled

// Pending signal has timestamp of 0
const signal3 = asyncSignal();
console.log(signal3.timestamp); // 0 - not yet fulfilled or rejected
```

### Metadata Storage

Each signal has a `meta` object for storing custom metadata:

```typescript
const signal = asyncSignal();

// Store custom data
signal.meta.userId = "12345";
signal.meta.requestId = "abc-123";
signal.meta.attempts = 1;
signal.meta.tags = ["important", "urgent"];

// Track lifecycle events
signal.meta.createdAt = Date.now();
signal.meta.status = "pending";

signal.resolve("success");
await signal();

signal.meta.status = "fulfilled";
signal.meta.completedAt = signal.timestamp;

// Metadata persists across reset
signal.reset();
console.log(signal.meta.userId); // "12345" - still available
console.log(signal.meta.attempts); // 1 - preserved

// Update for retry
signal.meta.attempts = 2;
```

**Type-Safe Metadata with Generics:**

You can specify the type of metadata using a second generic parameter:

```typescript
interface RequestMetadata {
    requestId: string;
    userId: string;
    attemptNumber: number;
    maxRetries: number;
}

// Create a signal with typed metadata
const signal = asyncSignal<string, RequestMetadata>();

// TypeScript now knows the exact type of meta
signal.meta.requestId = "req-123";      // ✅ Type-safe
signal.meta.userId = "user-456";         // ✅ Type-safe
signal.meta.attemptNumber = 1;           // ✅ Type-safe
signal.meta.maxRetries = 3;              // ✅ Type-safe
// signal.meta.invalidField = "test";    // ❌ Type error

// Works with static methods too
const resolved = asyncSignal.resolve<string, RequestMetadata>("success");
resolved.meta.requestId = "req-456";     // ✅ Type-safe

const rejected = asyncSignal.reject<string, RequestMetadata>("error");
rejected.meta.attemptNumber = 2;         // ✅ Type-safe
```

### Signal Reset

By default, signals need manual reset to be reused:

```typescript
const signal = asyncSignal();

await signal(); // First use
await signal(); // Returns same completed promise
signal.reset(); // Reset for reuse
await signal(); // Can be used again
```

## Advanced Usage

### Until Functions

Add conditions that must be met before a signal can resolve:

```typescript
let ready = false;
const signal = asyncSignal({ until: () => ready });

// This won't resolve until ready is true
signal.resolve(); // Will be blocked until condition is met

ready = true;
signal.resolve(); // Now it will resolve
```

### Auto Reset Option

Control whether signals automatically reset after completion. By default, `autoReset` is `false`, meaning you need to manually call `signal.reset()` to reuse the signal:

```typescript
// With autoReset disabled (default)
const signal1 = asyncSignal();
await signal1(); // First use
await signal1(); // Returns same completed promise
signal1.reset(); // Must manually reset to reuse
await signal1(); // Now can be used again

// With autoReset enabled
const signal2 = asyncSignal({ autoReset: true });
await signal2(); // Auto-resets after completion
await signal2(); // Can be used again without manual reset
```

### Abort Behavior Control

Control when the AbortController should be aborted using the `abortAt` option:

```typescript
// Default: abort on resolve, reject, and reset
const signal1 = asyncSignal({ abortAt: "all" });

// Only abort on reject (useful for network requests)
const signal2 = asyncSignal({ abortAt: "reject" });

// Only abort on resolve (useful for resource cleanup)
const signal3 = asyncSignal({ abortAt: "resolve" });

// Never auto-abort (manual control)
const signal4 = asyncSignal({ abortAt: "none" });
```

#### Use Cases

**Network Request Cancellation (abort only on errors):**

```typescript
const signal = asyncSignal({ abortAt: "reject" });
const abortSignal = signal.getAbortSignal();

async function fetchData() {
    try {
        const response = await fetch("/api/data", { signal: abortSignal! });
        signal.resolve("Success");
        return response;
    } catch (error) {
        signal.reject(error);
        throw error;
    }
}

// On success: fetch completes, no abort
// On error: both signal and fetch request are aborted
```

**Resource Cleanup (abort only on success):**

```typescript
const signal = asyncSignal({ abortAt: "resolve" });
const abortSignal = signal.getAbortSignal();

abortSignal.addEventListener("abort", () => {
    cleanupTemporaryFiles();
});

// Signal will abort and cleanup on success, but not on failure
```

### Abort Integration

Works seamlessly with AbortController:

```typescript
const signal = asyncSignal();

// Get abort signal for fetch calls
const abortSignal = signal.getAbortSignal();

fetch("/api/data", { signal: abortSignal });

// Abort will reject both the signal and fetch
signal.abort();
```

### Signal Destruction

Clean up signals and reject pending waiters:

```typescript
const signal = asyncSignal();

// Signal will be rejected with AbortError
signal.destroy();

// Subsequent awaits will throw AbortError
try {
    await signal();
} catch (error) {
    console.log(error.name); // 'AbortError'
}
```

## Real-World Examples

### Manual Event Waiting

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

// Wait for click event
await waitForEvent("#button", "click");
```

### Conditional Operations

```typescript
function waitForCondition(condition: () => boolean, timeout = 5000) {
    // Enable autoReset for multiple condition checks
    const signal = asyncSignal({ until: condition, timeout, autoReset: true });

    const interval = setInterval(() => {
        if (signal.resolve()) {
            clearInterval(interval);
        }
    }, 100);

    return signal(timeout, new Error("Condition not met"));
}
```

## API Reference

### asyncSignal()

```typescript
function asyncSignal<T = any, M extends Record<string, any> = Record<string, any>>(options?: AsyncSignalOptions): IAsyncSignal<T, M>;
```

**Static Methods:**

- `asyncSignal.resolve<T, M>(result?: T): IAsyncSignal<T, M>` - Create a pre-resolved signal
- `asyncSignal.reject<T, M>(error?: Error | string): IAsyncSignal<T, M>` - Create a pre-rejected signal

**Parameters:**

- `options` - Configuration options
    - `until` - Optional function that must return true for resolve to succeed
    - `timeout` - Default timeout in milliseconds (default: 0)
    - `autoReset` - Automatically reset signal after completion (default: false)
    - `abortAt` - Control when to abort AbortController (default: 'all')
        - `'all'` - Abort on resolve, reject, and reset
        - `'reject'` - Only abort on reject
        - `'resolve'` - Only abort on resolve
        - `'none'` - Never auto-abort

**Returns:** `IAsyncSignal` - Signal object with methods and properties

### IAsyncSignal Interface

```typescript
interface IAsyncSignal<T = any, M extends Record<string, any> = Record<string, any>> {
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

**Properties:**

- `result` - The resolved value (undefined if not resolved or rejected)
- `error` - The rejected error (undefined if not rejected or resolved)
- `timestamp` - The timestamp (milliseconds since epoch) when the signal was fulfilled, rejected, or aborted. Returns 0 if the signal is still pending.
- `meta` - A metadata object for storing custom data. Persists across reset/destroy operations.

**Accessing Results:**

```typescript
const signal = asyncSignal<string>();
signal.resolve("success");
await signal();

console.log(signal.result); // 'success'
console.log(signal.error); // undefined

// After rejection
signal.reject(new Error("failed"));
console.log(signal.result); // undefined
console.log(signal.error); // Error: failed
```

## Open Source Projects

- [VoerkaI18n](https://zhangfisher.github.io/voerka-i18n/)
- [AutoStore](https://zhangfisher.github.io/autostore/)
- [Logsets](https://zhangfisher.github.io/logsets/)
- [VoerkaLogger](https://zhangfisher.github.io/voerkalogger/)
- [FlexDecorators](https://zhangfisher.github.io/flex-decorators/)
- [FlexState](https://zhangfisher.github.io/flexstate/)
- [FlexTools](https://zhangfisher.github.io/flex-tools/)
- [Styledfc](https://zhangfisher.github.io/styledfc/)
- [json_comments_extension](https://github.com/zhangfisher/json_comments_extension)
- [mixed-cli](https://github.com/zhangfisher/mixed-cli)
- [flexvars](https://github.com/zhangfisher/flexvars)
- [yald](https://github.com/zhangfisher/yald)

## License

MIT
