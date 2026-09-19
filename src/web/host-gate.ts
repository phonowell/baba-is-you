// `__BABA_ALLOWED_HOSTS__` 由构建脚本经 esbuild define 注入：
// 本地预览构建注入 `null`（不锁域），部署构建注入允许的主机名列表。
// 非构建环境（tsx 测试）下该标识符不存在，按未锁定处理。
declare const __BABA_ALLOWED_HOSTS__: readonly string[] | null

const allowedHosts: readonly string[] | null =
  typeof __BABA_ALLOWED_HOSTS__ === 'undefined' ? null : __BABA_ALLOWED_HOSTS__

export const resolveHostLockMessage = (hostname: string): string | null =>
  allowedHosts === null || allowedHosts.includes(hostname)
    ? null
    : `This build only runs on ${allowedHosts.join(', ')}.`
