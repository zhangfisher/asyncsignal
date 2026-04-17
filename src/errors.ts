/**
 *  生成一个异步控制信号
 *
 *  当满足condition时会进行等待
 *
 *  定义一个异步等待信号
 *  let signal = asyncSignal()
 *
 *  //
 *  然后在需要等待的地方
 *  await signal()
 *  await signal(100)  代表信号会自动超时resolve
 *  await signal(100,new Error())  代表信号会自动超时reject
 *
 *  可以手动resolve或reject该signal
 *  当要结束等待时调用 signal.resolve()
 *  当等待出错时调用 signal.reject()
 *
 * 可以传入一个condition函数，当signal.resolve时，会同时进行调用，该函数必须返回true，否则会继承等待
 * 超时时不会调用
 * let signal = asyncSignal(()=>{})
 *
 *  当signal使用一次后，如果需要再次使用，则需要signal.reset()复位一下，然后就可以
 *   await signal()
 *
 *  @param {Function} constraint 约束函数，指定当resolve或reject时，需要同时满足这个约束函数返回true才会进行resolve或reject
 *
 */


export class AbortError extends Error {
    name: string = "AbortError";
}
