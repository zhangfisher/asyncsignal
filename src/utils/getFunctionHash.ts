/**
 * FNV-1a 32 位哈希实现
 * @param str 输入字符串
 * @param offset 偏移基础（不同种子产生不同哈希）
 */
function fnv1a32(str: string, offset: number): number {
    const prime = 0x01000193;
    let hash = offset;

    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        // 使用 Math.imul 确保 32 位整数乘法
        hash = Math.imul(hash, prime);
        hash |= 0; // 转为 32 位有符号整数
    }

    return hash;
}
export function getFunctionHash(func: Function) {
    const str = func.toString();

    // 使用两个不同的种子，产生两个独立的哈希值
    const hash1 = fnv1a32(str, 0x811c9dc5);
    const hash2 = fnv1a32(str, 0x84222325);

    // 组合为 64 位（16 位十六进制）
    const high = (hash1 >>> 0).toString(16).padStart(8, "0");
    const low = (hash2 >>> 0).toString(16).padStart(8, "0");
    return high + low;
}
