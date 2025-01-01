# AsyncSignal

Reusable asynchronous signals,it's a like `Promise.withResolvers`

[中文](./readme_CN.md)

## Installation

```ts
pnpm add asyncsignal
// or 
npm install asyncsignal
// or 
yarn add asyncsignal
```

## Usage

```ts
import { asyncSignal } from 'asyncsignal';

// Create a signal/Promise
const signal = asyncSignal();
// or with a constraint
// when the resolve is executed, the constraint function must return true
const signal = asyncSignal(()=>true);
// or with options
const signal = asyncSignal(()=>true,{timeout:100});

// wait signal is resolved
await signal()
// wait signal is resolved with a timeout
await signal(100)
// wait signal is resolved with a timeout and throw error
await signal(100,new Error())  
  

signal.resolve('resolved value')
// or
signal.reject('rejected value') 
signal.reject(new Error('rejected error'))

// check signal status
signal.isPending() 
signal.isResolved()
signal.isRejected()

// reset signal
signal.reset() 

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
- 
