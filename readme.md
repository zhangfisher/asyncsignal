# AsyncSignal

Reusable asynchronous signals, like `Promise.withResolvers()` but with more powerful features for managing asynchronous operations.

[中文](./readme_CN.md)

## Features

- **Signal Control**: Create reusable async signals that can be manually resolved or rejected
- **Timeout Support**: Built-in timeout functionality for async operations
- **Constraint Functions**: Add conditional logic to control when signals can resolve
- **Signal Management**: Batch manage multiple signals with AsyncSignalManager
- **Abort Support**: Native integration with AbortController for cancellation
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
import { asyncSignal } from 'asyncsignal';

// Create a basic signal
const signal = asyncSignal();

// Wait for the signal to resolve
await signal();

// Resolve the signal
signal.resolve('resolved value');

// Or reject the signal
signal.reject(new Error('rejected error'));
```

### Timeout Support

```typescript
const signal = asyncSignal();

// Wait with timeout (resolves after 100ms)
await signal(100);

// Wait with timeout and custom error
await signal(100, new Error('Timeout error'));
```

### Status Checking

```typescript
const signal = asyncSignal();

signal.isPending();    // true if waiting
signal.isResolved();   // true if resolved
signal.isRejected();   // true if rejected
```

### Signal Reset

By default, signals need manual reset to be reused:

```typescript
const signal = asyncSignal();

await signal();        // First use
await signal();        // Returns same completed promise
signal.reset();        // Reset for reuse
await signal();        // Can be used again
```

## Advanced Usage

### Constraint Functions

Add conditions that must be met before a signal can resolve:

```typescript
let ready = false;
const signal = asyncSignal(() => ready);

// This won't resolve until ready is true
signal.resolve(); // Will be blocked by constraint

ready = true;
signal.resolve(); // Now it will resolve
```

### Auto Reset Option

Control whether signals automatically reset after completion. By default, `autoReset` is `false`, meaning you need to manually call `signal.reset()` to reuse the signal:

```typescript
// With autoReset disabled (default)
const signal1 = asyncSignal();
await signal1();        // First use
await signal1();        // Returns same completed promise
signal1.reset();        // Must manually reset to reuse
await signal1();        // Now can be used again

// With autoReset enabled
const signal2 = asyncSignal(undefined, { autoReset: true });
await signal2();        // Auto-resets after completion
await signal2();        // Can be used again without manual reset
```

### Abort Integration

Works seamlessly with AbortController:

```typescript
const signal = asyncSignal();

// Get abort signal for fetch calls
const abortSignal = signal.getAbortSignal();

fetch('/api/data', { signal: abortSignal });

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

## AsyncSignalManager

Manage multiple signals with batch operations:

```typescript
import { AsyncSignalManager } from 'asyncsignal';

// Create manager with default timeout
const manager = new AsyncSignalManager({
  timeout: 60000 // 1 minute default timeout
});

// Create signals through manager
const signal1 = manager.create();
const signal2 = manager.create();

// Batch operations
manager.resolve('all resolved');      // Resolve all signals
manager.reject(new Error('failed'));  // Reject all signals
manager.reset();                      // Reset all signals

// Destroy specific signals
manager.destroy(signal1.id);

// Destroy all signals
manager.destroy();
```

### Manager Use Cases

- **Parallel Operations**: Coordinate multiple async tasks
- **Resource Management**: Clean up multiple signals at once
- **Batch Operations**: Resolve/reject multiple operations simultaneously
- **Timeout Control**: Set consistent timeouts across operations

## Real-World Examples

### Manual Event Waiting

```typescript
function waitForEvent(element: string, event: string) {
  const signal = asyncSignal();
  
  document.querySelector(element).addEventListener(event, () => {
    signal.resolve();
  }, { once: true });
  
  return signal(5000, new Error('Event timeout'));
}

// Wait for click event
await waitForEvent('#button', 'click');
```

### Async Task Queue

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

### Conditional Operations

```typescript
function waitForCondition(condition: () => boolean, timeout = 5000) {
  // Enable autoReset for multiple condition checks
  const signal = asyncSignal(condition, { timeout, autoReset: true });
  
  const interval = setInterval(() => {
    if (signal.resolve()) {
      clearInterval(interval);
    }
  }, 100);
  
  return signal(timeout, new Error('Condition not met'));
}
```

## API Reference

### asyncSignal()

```typescript
function asyncSignal(
  constraint?: () => boolean,
  options?: AsyncSignalOptions
): IAsyncSignal
```

**Parameters:**
- `constraint` - Optional function that must return true for resolve to succeed
- `options` - Configuration options
  - `timeout` - Default timeout in milliseconds (default: 0)
  - `autoReset` - Automatically reset signal after completion (default: false)

**Returns:** `IAsyncSignal` - Signal object with methods and properties

### IAsyncSignal Interface

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
