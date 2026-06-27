export function getId(len: number = 10) {
    let id = Math.random()
        .toString(36)
        .substring(2, len + 2);
    // 如果首字符不是数字，用 's' 替换
    return /^\d/.test(id) ? id : "s" + id.substring(1);
}
