import { describe, test, expect } from "bun:test";
import { asyncSignal } from "../asyncSignal";

describe("泛型类型推断测试", () => {
    test("应该支持为 meta 指定类型", () => {
        interface RequestMetadata {
            requestId: string;
            userId: string;
            attemptNumber: number;
        }

        const signal = asyncSignal<string, RequestMetadata>();

        // meta 应该具有 RequestMetadata 类型
        signal.meta.requestId = "req-123";
        signal.meta.userId = "user-456";
        signal.meta.attemptNumber = 1;

        expect(signal.meta.requestId).toBe("req-123");
        expect(signal.meta.userId).toBe("user-456");
        expect(signal.meta.attemptNumber).toBe(1);
    });

    test("应该支持类型推断和自动补全", () => {
        interface UserMetadata {
            id: string;
            name: string;
            role: "admin" | "user";
        }

        const signal = asyncSignal<number, UserMetadata>();

        // TypeScript 应该知道 meta 的类型
        signal.meta.id = "123";
        signal.meta.name = "John";
        signal.meta.role = "admin";

        // 这行应该有类型错误（如果取消注释）
        // signal.meta.invalidField = "test"; // Type error

        expect(signal.meta.id).toBe("123");
        expect(signal.meta.name).toBe("John");
        expect(signal.meta.role).toBe("admin");
    });

    test("应该支持复杂嵌套的 meta 类型", () => {
        interface ComplexMetadata {
            config: {
                timeout: number;
                retries: number;
                headers: Record<string, string>;
            };
            tracking: {
                startTime: number;
                endTime?: number;
                duration?: number;
            };
        }

        const signal = asyncSignal<boolean, ComplexMetadata>();

        signal.meta.config = {
            timeout: 5000,
            retries: 3,
            headers: { "Content-Type": "application/json" }
        };

        signal.meta.tracking = {
            startTime: Date.now()
        };

        expect(signal.meta.config.timeout).toBe(5000);
        expect(signal.meta.tracking.startTime).toBeGreaterThan(0);
    });

    test("asyncSignal.resolve 应该支持 meta 泛型", () => {
        interface ResponseMetadata {
            statusCode: number;
            headers: Record<string, string>;
        }

        const signal = asyncSignal.resolve<string, ResponseMetadata>("success");

        signal.meta.statusCode = 200;
        signal.meta.headers = { "content-type": "text/plain" };

        expect(signal.meta.statusCode).toBe(200);
        expect(signal.meta.headers["content-type"]).toBe("text/plain");
    });

    test("asyncSignal.reject 应该支持 meta 泛型", () => {
        interface ErrorMetadata {
            errorCode: string;
            retryable: boolean;
            attempts: number;
        }

        const signal = asyncSignal.reject<string, ErrorMetadata>("error");

        signal.meta.errorCode = "E500";
        signal.meta.retryable = true;
        signal.meta.attempts = 1;

        expect(signal.meta.errorCode).toBe("E500");
        expect(signal.meta.retryable).toBe(true);
        expect(signal.meta.attempts).toBe(1);
    });

    test("不指定 meta 类型时应该默认为 Record<string, any>", () => {
        const signal = asyncSignal<string>();

        signal.meta.anyField = "any value";
        signal.meta.number = 123;
        signal.meta.object = { key: "value" };

        expect(signal.meta.anyField).toBe("any value");
        expect(signal.meta.number).toBe(123);
        expect(signal.meta.object).toEqual({ key: "value" });
    });

    test("应该支持可选属性的 meta 类型", () => {
        interface OptionalMetadata {
            required: string;
            optional1?: number;
            optional2?: boolean;
        }

        const signal = asyncSignal<void, OptionalMetadata>();

        signal.meta.required = "test";

        // 可选属性可以不设置
        expect(signal.meta.required).toBe("test");

        // 也可以设置
        signal.meta.optional1 = 123;
        expect(signal.meta.optional1).toBe(123);
    });

    test("应该支持只读属性的 meta 类型", () => {
        interface ReadonlyMetadata {
            readonly id: string;
            readonly createdAt: number;
            mutable: string;
        }

        const signal = asyncSignal<void, ReadonlyMetadata>();

        signal.meta.id = "123";
        signal.meta.createdAt = Date.now();
        signal.meta.mutable = "can change";

        expect(signal.meta.id).toBe("123");
        expect(signal.meta.mutable).toBe("can change");
    });

    test("reset 后 meta 类型应该保持不变", async () => {
        interface TypedMetadata {
            counter: number;
            timestamp: number;
        }

        const signal = asyncSignal<void, TypedMetadata>();

        signal.meta.counter = 1;
        signal.meta.timestamp = Date.now();

        signal.resolve();
        await signal();

        signal.reset();

        // meta 类型应该保持，值也应该保留
        expect(signal.meta.counter).toBe(1);
        expect(signal.meta.timestamp).toBeGreaterThan(0);

        // 可以继续使用正确的类型
        signal.meta.counter = 2;
        expect(signal.meta.counter).toBe(2);
    });

    test("应该支持联合类型的 meta", () => {
        type LogLevel = "debug" | "info" | "warn" | "error";

        interface LogMetadata {
            level: LogLevel;
            message: string;
            data?: unknown;
        }

        const signal = asyncSignal<void, LogMetadata>();

        signal.meta.level = "info";
        signal.meta.message = "Test message";

        // TypeScript 应该只允许这四个值
        signal.meta.level = "warn"; // OK
        // signal.meta.level = "invalid"; // Type error

        expect(signal.meta.level).toBe("warn");
        expect(signal.meta.message).toBe("Test message");
    });
});
