# AsyncSignal

Reusable asynchronous signals for JavaScript/TypeScript applications.

[中文](./readme_CN.md)

## Installation

```ts
pnpm add asyncsignal
// or 
npm install asyncsignal
// or 
yarn add asyncsignal
```

## Features

- 🚦 **Reusable Signals**: Create async signals that can be reused after reset
- 🔒 **Constraint Support**: Add conditions that must be met before signal resolution
- ⏱️ **Timeout Control**: Set timeout for signal resolution with customizable behavior
- 🎯 **Signal States**: Track signal states (pending, resolved, rejected)
- 🎮 **Signal Management**: Manage multiple signals with AsyncSignalManager
- 🔄 **Reset Capability**: Reset signals to their initial state for reuse
- 💪 **TypeScript Support**: Full TypeScript support with type definitions

## Usage

### Basic Usage

```ts
import { asyncSignal } from 'asyncsignal';

// Create a basic signal
const signal = asyncSignal();

// Wait for signal resolution
await signal();

// Resolve the signal
signal.resolve('success');

// Reject the signal
signal.reject(new Error('something went wrong'));

// Reset the signal for reuse
signal.reset();
```

### Advanced Features

#### Constraint Functions

```ts
// Signal will only resolve when the constraint function returns true
const signal = asyncSignal(() => someCondition === true);

// Attempting to resolve when constraint is not met will be ignored
signal.resolve(); // Will only resolve if someCondition === true
```

#### Timeout Control

```ts
// Create signal with default timeout
const signal = asyncSignal(undefined, { timeout: 1000 });

// Wait with timeout and default value
await signal(2000); // Will resolve after 2 seconds

// Wait with timeout and error
await signal(2000, new Error('Timeout occurred')); // Will reject with error after 2 seconds
```

#### State Checking

```ts
const signal = asyncSignal();

console.log(signal.isPending()); // true after creation
console.log(signal.isResolved()); // true after resolution
console.log(signal.isRejected()); // true after rejection
```

### Error Handling

```ts
import { asyncSignal, AsyncSignalAbort } from 'asyncsignal';

// Handle signal destruction
const signal = asyncSignal();
try {
  await signal();
} catch (error) {
  if (error instanceof AsyncSignalAbort) {
    console.log('Signal was destroyed');
  }
}
```

### Implementation Details

- Signal states are mutually exclusive (pending, resolved, rejected)
- Calling `resolve()` or `reject()` on a non-pending signal will be ignored
- Calling `resolve()` when the constraint function returns false will be silently ignored
- The `destroy()` method will reject pending signals with AsyncSignalAbort error

### Managing Multiple Signals

```ts
import { AsyncSignalManager } from 'asyncsignal';

// Create a signal manager with default timeout
const manager = new AsyncSignalManager({ timeout: 5000 });

// Create multiple signals
const signal1 = manager.create();
const signal2 = manager.create(() => someCondition);

// Resolve all signals with optional value
manager.resolve('success');

// Reject all signals
manager.reject(new Error('batch operation failed'));

// Reset all signals for reuse
manager.reset();

// Destroy specific signals
manager.destroy(signal1.id);

// Destroy multiple signals
manager.destroy([signal1.id, signal2.id]);

// Destroy all signals
manager.destroy();
```

## Open Source Projects

- [VoerkaI18n](https://zhangfisher.github.io/voerka-i18n/)
- [speedform](https://zhangfisher.github.io/speed-form/)
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