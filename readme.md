# AsyncSignal

Reusable asynchronous signals, like `Promise.withResolvers()` but with more powerful features for managing asynchronous operations.

[中文](./readme_CN.md)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [AsyncSignal](#asyncsignal)
    - [Features](#features)
    - [Guide](#guide)
    - [Use Cases](#use-cases)
    - [API Reference](#api-reference)
    - [IAsyncSignal Interface](#iasyncsignal-interface)
- [AsyncLoader](#asyncloader)
    - [Features](#features-1)
    - [Quick Start](#quick-start)
    - [Guide](#guide-1)
    - [API Reference](#api-reference-1)
- [Open Source Projects](#open-source-projects)
- [License](#license)

## Overview

AsyncSignal provides two complementary building blocks for asynchronous operations:

| Module | What it is | Key capabilities |
| --- | --- | --- |
| **`asyncSignal`** | A reusable async signal — like `Promise.withResolvers()`, but resettable, observable, and abort-aware | Manual resolve/reject/reset; static `resolve`/`reject`; wait timeout; constraints (`until`); abort integration; typed metadata |
| **`AsyncLoader`** | An async data loader built on top of `asyncSignal` | Load + cache + abort + per-attempt timeout + auto retry; instance reuse (`multiplex`); error fallback (`defaultValue`) |

Use `asyncSignal` directly for fine-grained control of an async flow; reach for `AsyncLoader` when you need a loading lifecycle, caching, retries, and deduplication around a data-fetching function.

## Installation

```bash
pnpm add asyncsignal
# or
npm install asyncsignal
# or
yarn add asyncsignal
# or
bun add asyncsignal
```

## AsyncSignal

A reusable async signal — like `Promise.withResolvers()`, but resettable, observable, and abort-aware.

### Features

- **Signal Control**: Create reusable async signals that can be manually resolved or rejected
- **Static Methods**: Create pre-resolved or pre-rejected signals with `asyncSignal.resolve()` and `asyncSignal.reject()`
- **Timestamp Tracking**: Automatic timestamp recording when signals are fulfilled, rejected, or aborted
- **Metadata Storage**: Built-in metadata object for storing custom data and tracking information
- **Timeout Support**: Built-in timeout functionality for async operations
- **Constraint Functions**: Add conditional logic to control when signals can resolve
- **Abort Support**: Native integration with AbortController for cancellation
- **Abort Behavior Control**: Fine-grained control over when to abort AbortController
- **External Signal Linkage**: Pass an external AbortSignal that automatically aborts the current signal when aborted
- **Auto Reset**: Optional automatic signal reset (default: manual reset required)

### Guide

#### Creating a Signal

```typescript
import { asyncSignal } from "asyncsignal";

// Create a basic signal
const signal = asyncSignal();

// Wait for the signal to resolve or reject
await signal();

// Resolve the signal
signal.resolve("resolved value");

// Or reject the signal
signal.reject(new Error("rejected error"));
```

#### Static Methods

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
        .then((response) => response.json())
        .then((data) => signal.resolve(data))
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

#### Timeout Support

```typescript
const signal = asyncSignal();

// Wait with timeout (auto-resolves after 100ms)
await signal({ timeout: 100 });

// Wait with timeout and custom error
await signal({ timeout: 100, returns: new Error("Timeout error") });
```

#### Status Checking

```typescript
const signal = asyncSignal();

signal.isPending(); // true if waiting
signal.isFulfilled(); // true if resolved
signal.isRejected(); // true if rejected
```

#### Result Access

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

// A pending signal has timestamp of 0
const signal3 = asyncSignal();
console.log(signal3.timestamp); // 0 - not yet fulfilled or rejected
```

#### Metadata Storage

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
signal.meta.requestId = "req-123"; // ✅ Type-safe
signal.meta.userId = "user-456"; // ✅ Type-safe
signal.meta.attemptNumber = 1; // ✅ Type-safe
signal.meta.maxRetries = 3; // ✅ Type-safe
// signal.meta.invalidField = "test";    // ❌ Type error

// Works with static methods too
const resolved = asyncSignal.resolve<string, RequestMetadata>("success");
resolved.meta.requestId = "req-456"; // ✅ Type-safe

const rejected = asyncSignal.reject<string, RequestMetadata>("error");
rejected.meta.attemptNumber = 2; // ✅ Type-safe
```

#### Signal Reset

By default, signals need manual reset to be reused:

```typescript
const signal = asyncSignal();

await signal(); // First use
await signal(); // Returns the same completed promise
signal.reset(); // Reset for reuse
await signal(); // Can be used again
```

#### Until Functions

Add conditions that must be met before a signal can resolve:

```typescript
let ready = false;
const signal = asyncSignal({ until: () => ready });

// This won't resolve until ready is true
signal.resolve(); // Will be blocked by the condition

ready = true;
signal.resolve(); // Now it can resolve
```

#### Auto Reset

Control whether signals automatically reset after completion. By default, `autoReset` is `false`, meaning you need to manually call `signal.reset()` to reuse the signal:

```typescript
// With autoReset disabled (default)
const signal1 = asyncSignal();
await signal1(); // First use
await signal1(); // Returns the same completed promise
signal1.reset(); // Must manually reset to reuse
await signal1(); // Now can be used again

// With autoReset enabled
const signal2 = asyncSignal({ autoReset: true });
await signal2(); // Auto-resets after completion
await signal2(); // Can be used again without manual reset
```

#### Abort Behavior Control

`asyncSignal` integrates with `AbortSignal`.

- You may pass an `AbortSignal` when creating an `asyncSignal`; when the `AbortSignal` aborts, the `asyncSignal` is automatically aborted.

- Use the `abortAt` option to control the behavior of `asyncSignal` when the `AbortSignal` is aborted.

    ```typescript
    // Default: abort on resolve, reject, and reset
    const signal1 = asyncSignal({ abortAt: "all" });
    const abortSignal1 = signal1.getAbortSignal();
    abortSignal1.addEventListener("abort", () => {
        // Fires when asyncSignal resolves, rejects, or resets
    });

    // Only abort on reject (useful for network requests)
    const signal2 = asyncSignal({ abortAt: "reject" });
    const abortSignal2 = signal2.getAbortSignal();
    abortSignal2.addEventListener("abort", () => {
        // Only fires when asyncSignal rejects
    });

    // Only abort on resolve (useful for resource cleanup)
    const signal3 = asyncSignal({ abortAt: "resolve" });
    const abortSignal3 = signal3.getAbortSignal();
    abortSignal3.addEventListener("abort", () => {
        // Only fires when asyncSignal resolves
    });

    // Never auto-abort (manual control)
    const signal4 = asyncSignal({ abortAt: "none" });
    const abortSignal4 = signal4.getAbortSignal();
    abortSignal4.addEventListener("abort", () => {
        // Never fires
    });
    ```

### Use Cases

#### Network Request Cancellation (abort only on errors)

```typescript
const signal = asyncSignal({ abortAt: "reject" });
const abortSignal = signal.getAbortSignal();

async function fetchData() {
    try {
        const response = await fetch("/api/data", { signal: abortSignal! });
        signal.resolve("success");
        return response;
    } catch (error) {
        signal.reject(error);
        throw error;
    }
}

// On success: fetch completes, no abort
// On error: both the signal and the fetch request are aborted
```

#### Resource Cleanup (abort only on success)

```typescript
const signal = asyncSignal({ abortAt: "resolve" });
const abortSignal = signal.getAbortSignal();

abortSignal.addEventListener("abort", () => {
    cleanupTemporaryFiles();
});

// The signal aborts and cleans up on success, but not on failure
```

#### External Signal Linkage

Pass an external AbortSignal via the `abortSignal` option; when the external signal aborts, the current signal is automatically aborted as well (an already-aborted signal is ignored):

```typescript
const controller = new AbortController();
const signal = asyncSignal({ abortSignal: controller.signal });

const promise = signal();
// When the external signal aborts, the signal is aborted (rejects with an AbortError)
controller.abort();
```

You can also pass a per-call `abortSignal` to each `signal()` invocation, behaving the same as the constructor option:

```typescript
const controller = new AbortController();
const signal = asyncSignal();

// Only this wait is controlled by controller
await signal({ abortSignal: controller.signal });
controller.abort(); // aborts the current signal
```

#### Manual Event Waiting

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

// Wait for click event
await waitForEvent("#button", "click");
```

### API Reference

```typescript
function asyncSignal<T = any, M extends Record<string, any> = Record<string, any>>(
    options?: AsyncSignalOptions,
): IAsyncSignal<T, M>;
```

#### Static Methods

- `asyncSignal.resolve<T, M>(result?: T): IAsyncSignal<T, M>` - Create a pre-resolved signal
- `asyncSignal.reject<T, M>(error?: Error | string): IAsyncSignal<T, M>` - Create a pre-rejected signal

**Parameters:**

- `options` - Configuration options
    - `until` - Optional function that must return true for resolve to succeed
    - `autoReset` - Automatically reset signal after completion (default: false)
    - `abortAt` - Control when to abort AbortController (default: 'all')
        - `'all'` - Abort on resolve, reject, and reset
        - `'reject'` - Only abort on reject
        - `'resolve'` - Only abort on resolve
        - `'none'` - Never auto-abort
    - `abortSignal` - Optional external AbortSignal that aborts the current signal when aborted (an already-aborted signal is ignored)

**Returns:** `IAsyncSignal` - Signal object with methods and properties

### IAsyncSignal Interface

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

**Methods:**

- `signal(args?)` - Wait for the signal to `resolve` or `reject`; `args` is an `AsyncSignalArgs` object:
    - `timeout` - Timeout in ms; enables auto-settlement when `>0`
    - `returns` - Settlement value on timeout; treated as reject when an `Error` instance, otherwise as resolve
    - `abortSignal` - Optional external `AbortSignal` that aborts the current `signal` when aborted
- `id` - Unique identifier of the signal
- `reset()` - Reset the signal for reuse
- `reject(e?)` - Reject the signal
- `resolve(result?)` - Resolve the signal
- `destroy()` - Destroy the signal and reject pending waiters
- `isFulfilled()` - Check whether resolved
- `isRejected()` - Check whether rejected
- `isPending()` - Check whether waiting
- `abort()` - Abort the signal operation
- `getAbortSignal()` - Get the AbortController's signal

## AsyncLoader

An async data loader built on top of `AsyncSignal`, encapsulating five capabilities: **loading + caching + abort + timeout + retry**. The loader function receives a merged abort signal via `args.abortSignal`, which can be passed directly to `fetch`'s `signal` option.

### Features

- **Auto/Lazy loading**: `autostart` defaults to `true` (load on construction); set to `false` to trigger on first `get()`
- **Caching**: When `cache>0`, results are cached by `hash`; `get()` auto-reloads after expiry
- **Abort**: `abort()` penetrates to the underlying request via the internal signal
- **Per-attempt timeout**: `timeout>0` sets a timeout for each attempt; a timeout counts as a retryable failure
- **Auto retry**: `retry>0` auto-retries on timeout and business errors; manual abort does not retry
- **Multiplexing**: reuse loader instances by `hash` — `"off"` (independent), `"restart"` (abort the inflight load of the same hash and reload with the first loader), or `"share"` (fully share the inflight load and result)
- **Error fallback**: `defaultValue` swallows the final failure (business error / timeout after retries exhausted) and resolves a fallback value
- **Sync loading**: the underlying loader may return `Promise<T>` or a synchronous value `T`; a synchronous `throw` goes through the same error-handling chain as an async rejection (retry / fallback / callbacks)
- **Loading status**: `isPending()` / `isFulfilled()` / `isRejected()` reflect the loading task's status, with an interface aligned with `asyncSignal`

### Quick Start

```typescript
import { AsyncLoader } from "asyncsignal";

// The first constructor argument is the underlying loader function
const loader = new AsyncLoader(async (args) =>
    const result = fetch("/api/data", { signal: args.abortSignal })
    return await r.json()
);

const data = await loader.get(); // get the result (returns cached value if fresh)
loader.abort(); // abort loading
```

### Guide

#### Options

The `AsyncLoaderOptions` type:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `autostart` | `boolean` | `true` | Whether to start loading on construction; set to `false` for lazy loading on first `get()` |
| `cache` | `number` | `0` | Cache TTL in ms. `=0` disables caching, `>0` sets the TTL |
| `hash` | `string` | auto-generated | Unique hash identifying the load task, also used as cache key; auto-generated per instance when `cache>0` but not provided |
| `abortSignal` | `AbortSignal` | — | External abort signal; aborts loading when triggered (and does not trigger retry) |
| `timeout` | `number` | — | Per-attempt timeout in ms, effective when `>0`; a timeout counts as a retryable failure |
| `retry` | `number` | `0` | Max retry count on failure. Manual abort does not retry; timeout and business errors do |
| `retryDelay` | `number` | `0` | Milliseconds to wait before each retry |
| `multiplex` | `"off" \| "restart" \| "share"` | `"off"` | Reuse loader instances by `hash`. `"off"`: each instance is independent; `"restart"`: when hitting the same `hash` that is inflight, abort that load and reload with the first instance's loader (later loaders are ignored); `"share"`: fully share the inflight load and result of the first instance. Auto-generates a hash from the loader function when not `off` and no `hash` is given |
| `defaultValue` | `T` | — | Fallback resolved on final failure (business error / timeout after retries exhausted). Falsy values (`0` / `""` / `null` / `false`) are valid when explicitly provided. No effect on manual abort; not written to cache |
| `storage` | `IStorage` | `MapStorage` | Storage backend for cache entries |
| `onBeforeLoad` | `() => void` | — | Called before loading starts (only on actual loads, not cache hits); errors thrown inside are ignored |
| `onAfterLoad` | `(result?, error?) => void` | — | Called after loading ends (success yields `result`, failure/abort yields `error`), not on cache hits; errors thrown inside are ignored |

#### Caching

When caching is enabled, results with the same `hash` are reused within the TTL and auto-reloaded after expiry:

```typescript
const loader = new AsyncLoader(
    (args) => fetch("/api/data", { signal: args.abortSignal }).then((r) => r.json()),
    { cache: 60_000, hash: "data" } // cache for 60 seconds
);

await loader.get(); // first load, writes to cache
await loader.get(); // cache hit, underlying not called

loader.clear(); // clear current instance's cache entry
loader.clearAll(); // clear all cache entries (shared storage)
```

#### Abort & Timeout

```typescript
const loader = new AsyncLoader(
    (args) => fetch("/api/data", { signal: args.abortSignal }),
    { timeout: 5_000 } // 5-second timeout per attempt
);

loader.abort(); // abort the in-flight request, penetrating to fetch
```

Timeout and manual abort produce different error types:

- **Timeout** final failure (retries exhausted or retry disabled) → rejects with `TimeoutError`;
- **Manual `abort()` / external `abortSignal`** → rejects with `AbortError`;
- Business errors → the original error is propagated as-is.

#### Retry

`retry` auto-retries on timeout and business failures; manual abort (`abort()` or external `abortSignal`) does not retry:

```typescript
const loader = new AsyncLoader(
    (args) => fetch("/api/data", { signal: args.abortSignal }),
    {
        timeout: 5_000, // 5 seconds per attempt
        retry: 3, // up to 3 retries (4 attempts total)
        retryDelay: 1_000, // wait 1 second before each retry
    }
);
```

#### Multiplexing

Reuse loader instances by `hash` to deduplicate concurrent or repeated loads. Effective only when `hash` is provided (or auto-generated from the loader function):

```typescript
// "share": loaders with the same hash share one inflight load
const l1 = new AsyncLoader(fn, { hash: "req", multiplex: "share" });
const l2 = new AsyncLoader(fn, { hash: "req", multiplex: "share" });
console.log(l1 === l2); // true — same instance, one underlying call

// "restart": a new loader with the same hash aborts the inflight load and reloads
const a = new AsyncLoader(fnA, { hash: "req", multiplex: "restart" });
const b = new AsyncLoader(fnB, { hash: "req", multiplex: "restart" });
// a's inflight load is aborted, reloaded with fnA (fnB is ignored)
```

- `"off"` (default): each instance is independent.
- `"restart"`: hitting an **inflight** instance of the same hash aborts it and reloads with the first instance's loader.
- `"share"`: hitting the same hash fully shares the inflight load and result.

> Both modes behave the same when the matched instance is pending (not yet loading) or there is no match.

#### Default Value

On final failure (business error, or timeout after retries are exhausted), providing `defaultValue` swallows the error and resolves the fallback instead:

```typescript
const loader = new AsyncLoader(fetchUser, { defaultValue: defaultUser });

const user = await loader.get(); // on failure, resolves defaultUser instead of throwing
```

- Falsy values (`0` / `""` / `null` / `false`) are valid fallbacks when explicitly provided.
- Has **no effect** on manual `abort()` (still rejects with `AbortError`).
- The fallback is not written to the cache, so the next `get()` reloads to fetch the real value.

#### Refresh & Invalidate

`refresh()` forces a reload ignoring fresh cache; `invalidate()` marks data stale so the next `get()` reloads:

```typescript
const loader = new AsyncLoader(fn, { cache: 60_000, hash: "data" });
await loader.get();

await loader.refresh(); // force reload now, returns the new result (aborts any inflight load)
loader.invalidate(); // mark stale; the next get() reloads
await loader.get(); // reloads
```

- `refresh(args?)`: clears the cache and reloads immediately; aborts any inflight load first. Returns the new result.
- `invalidate()`: clears the cache entry and resets a completed signal, but does **not** trigger loading — the next `get()` does. Unlike `clear()`, it also works without a cache (`cache=0`).

#### Loading Status

`isPending()` / `isFulfilled()` / `isRejected()` reflect the execution status of the loading task (interface aligned with the `asyncSignal` methods of the same name):

```typescript
const loader = new AsyncLoader(fn, { autostart: false });

loader.isPending(); // whether loading is in progress (including retries)
loader.isFulfilled(); // whether the load succeeded
loader.isRejected(); // whether the load failed (business error / timeout / abort)

await loader.get();
loader.isFulfilled(); // true
```

- `isPending()` is based on `loading`: it is only `true` while **actually loading**. When "never loaded" or after `invalidate()`, the signal is still pending but no load is in progress, so this returns `false`.
- `isFulfilled()` is `true` when the load succeeded (including `defaultValue` fallback).
- `isRejected()` is `true` when the load failed (business error / timeout / abort).
- The `loading` property is also directly accessible, with the same semantics as `isPending()`.

### API Reference

**Constructor:**

```typescript
new AsyncLoader<T>(loader: (args: AsyncLoaderArgs) => Promise<T> | T, options?: AsyncLoaderOptions)
```

**Instance methods:**

| Method | Description |
| --- | --- |
| `get(args?)` | Get the result; auto-triggers loading on first call / cache stale / last failure. `args` is forwarded to the internal signal (`timeout` is a wait timeout, semantically different from `options.timeout`) |
| `load()` | Trigger a load (usually no need to call manually; `get()` triggers it automatically) |
| `refresh(args?)` | Force a reload ignoring fresh cache; aborts any inflight load first, then reloads and returns the new result. `args` is forwarded to the internal signal |
| `invalidate()` | Mark the data stale: clears the cache entry and resets a completed signal, so the next `get()` reloads. Does not trigger loading immediately. Unlike `clear()`, it also works without a cache (`cache=0`) |
| `abort()` | Abort loading, penetrating to the underlying request; also terminates any pending retry wait |
| `clear()` | Clear the current instance's cache entry |
| `clearAll()` | Clear all cache entries in the shared storage |
| `isPending()` | Whether loading is in progress (including retries); based on `loading` |
| `isFulfilled()` | Whether the load succeeded (including `defaultValue` fallback) |
| `isRejected()` | Whether the load failed (business error / timeout / abort) |

**Static methods:**

| Method | Description |
| --- | --- |
| `AsyncLoader.clearLoaderCache()` | Clear the multiplex inflight-instance cache; mainly for test isolation between cases sharing a `hash` |

**Instance properties:**

| Property | Description |
| --- | --- |
| `signal` | The internal `IAsyncSignal` carrying the result; observe its state and `result` / `error` |
| `loading` | Whether a load (including retries) is in progress |
| `loader` | The underlying loader function (constructor's first argument) |
| `hash` | The cache/multiplex key (explicit or auto-generated) |
| `options` | The merged constructor options |

## Open Source Projects

The following projects use AsyncSignal:

- [VoerkaI18n](https://zhangfisher.github.io/voerka-i18n/) - An all-in-one internationalization solution for React/Vue/Nodejs
- [AutoStore](https://zhangfisher.github.io/autostore/) - Automated state management
- [Logsets](https://zhangfisher.github.io/logsets/) - Terminal UI development toolkit
- [VoerkaLogger](https://zhangfisher.github.io/voerkaloger/) - A simple logging library
- [FlexDecorators](https://zhangfisher.github.io/flex-decorators/) - Decorator development toolkit
- [FlexState](https://zhangfisher.github.io/flexstate/) - Finite state machine library
- [FlexTools](https://zhangfisher.github.io/flex-tools/) - General-purpose utility library
- [Styledfc](https://zhangfisher.github.io/styledfc/) - A tiny, elegant CSS-in-JS library
- [json_comments_extension](https://github.com/zhangfisher/json_comments_extension) - A VS Code extension that adds comments to JSON files
- [mixed-cli](https://github.com/zhangfisher/mixed-cli) - A library for building interactive CLI programs
- [flexvars](https://github.com/zhangfisher/flexvars) - A powerful string interpolation / variable processing library
- [yald](https://github.com/zhangfisher/yald) - A front-end link debugging helper

## License

MIT
