# AsyncSignal

可复用的异步信号,类似`Promise.withResolvers`

[English](./readme.md)

## 安装

```ts
pnpm add asyncsignal
// or 
npm install asyncsignal
// or 
yarn add asyncsignal
```

## 用法

```ts
import { asyncSignal } from 'asyncsignal';

// 创建一个异步信号，实质上就是Promise
const signal = asyncSignal();
// 指定一个约束函数，当执行resolve时需要同时满足约束函数返回true
const signal = asyncSignal(()=>true);
// 指定一个配置参数
const signal = asyncSignal(()=>true,{timeout:100});

// 等待resolved
await signal()
// 等待resolved，指定一个超时时间
await signal(100)
// 等待resolved，指定一个超时时间，如果超时则抛出错误
await signal(100,new Error())  
  

signal.resolve('resolved value')
signal.reject('rejected value') 
signal.reject(new Error('rejected error'))

// 信号状态检查
signal.isPending() 
signal.isResolved()
signal.isRejected()

// 重置信号
signal.reset() 

```

## 开源项目 

- [全流程一健化React/Vue/Nodejs国际化方案 - VoerkaI18n](https://zhangfisher.github.io/voerka-i18n/)
- [无以伦比的React表单开发库 - speedform](https://zhangfisher.github.io/speed-form/)
- [终端界面开发增强库 - Logsets](https://zhangfisher.github.io/logsets/)
- [简单的日志输出库 - VoerkaLogger](https://zhangfisher.github.io/voerkalogger/)
- [装饰器开发 - FlexDecorators](https://zhangfisher.github.io/flex-decorators/)
- [有限状态机库 - FlexState](https://zhangfisher.github.io/flexstate/)
- [通用函数工具库 - FlexTools](https://zhangfisher.github.io/flex-tools/)
- [小巧优雅的CSS-IN-JS库 - Styledfc](https://zhangfisher.github.io/styledfc/)
- [为JSON文件添加注释的VSCODE插件 - json_comments_extension](https://github.com/zhangfisher/json_comments_extension)
- [开发交互式命令行程序库 - mixed-cli](https://github.com/zhangfisher/mixed-cli)
- [强大的字符串插值变量处理工具库 - flexvars](https://github.com/zhangfisher/flexvars)
- [前端link调试辅助工具 - yald](https://github.com/zhangfisher/yald)