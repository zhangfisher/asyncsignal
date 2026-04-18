import { IAsyncSignal } from "./types";
import { asyncSignal } from "./asyncSignal";

/**
 *   管理多个异步信号，并确保能正确resolve和reject
 *
 *
 *
 *  let signals = new AsyncSignalManager({
 *      timeout:60 * 1000,               // 所有信号均在1分钟后自动超时，0代表不设超时，并且此值应该大于signal(timeout)时指定的超时值
 *  })
 *
 *  signal = signals.create() 创建一个asyncSignal
 *
 *  signals.destroy()   销毁所有异步信号
 *  signal.resolve()    resolve所有异步信号
 *  signal.reject()     reject所有异步信号
 *  signal.reset()      reset所有异步信号
 *
 *
 */

export class AsyncSignalManager {
    #_signals: Record<string, IAsyncSignal> = {};
    constructor(public options?: { timeout: number }) {
        this.options = Object.assign(
            {
                timeout: 0, // 为所有异步信号提供一个默认的超时时间，当信号超时未resolve时，会自动进行reject(timeout)
            },
            options,
        );
    }
    get signals(): Record<string, IAsyncSignal> {
        return this.#_signals;
    }

    /**
     * 创建新的异步信号
     * @param constraint         额外的约束条件
     * @param id
     */
    create(constraint?: () => boolean) {
        let signal = asyncSignal({ ...this.options, constraint });
        this.#_signals[signal.id] = signal;
        return signal;
    }

    /**
     * 销毁指定的或者所有异步信号
     *
     *  destroy(id)
     *  destroy([id,id,...])
     *  destroy()                   // 销毁所有
     * @param {string} id           可选的信号id,如果未指定则删除所有的信号
     *
     */
    destroy(id?: number | number[] | undefined) {
        let ids = Array.isArray(id) ? id : id === undefined ? Object.keys(this.#_signals) : [id];
        for (let id of ids) {
            if (id in this.#_signals) {
                try {
                    this.#_signals[id].destroy();
                    delete this.#_signals[id];
                } catch (e) {}
            }
        }
    }
    resolve() {
        let args = arguments;
        Object.values(this.#_signals).forEach((signal) => signal.resolve(args));
    }
    reject(e?: Error | string) {
        Object.values(this.#_signals).forEach((signal) => signal.reject(e));
    }
    reset() {
        Object.values(this.#_signals).forEach((signal) => signal.reset());
    }
    abort() {
        Object.values(this.#_signals).forEach((signal) => signal.abort());
    }
}
