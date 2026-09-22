import { Directory, File, Paths } from 'expo-file-system'

/**
 * 「首次启动哨兵」：一个放在 App 沙盒里的空文件。
 *
 * iOS 的 Keychain（SecureStore 底层）**卸载 App 不会清**，所以卸载重装后会发现
 * 上一份安装的账号/会话还在、直接就登录了。而沙盒文件**随 App 卸载一起删**——
 * 所以「哨兵文件不存在」就等价于「这是一次全新安装」，据此把 Keychain 里的旧凭据清掉。
 *
 * 不用 SecureStore 存这个标记（它也不随卸载清，起不到判定作用）。
 */
const SENTINEL_DIR = new Directory(Paths.document, 'qj')
const SENTINEL_FILE = new File(SENTINEL_DIR, 'install.sentinel')

export async function hasInstallSentinel(): Promise<boolean> {
  try {
    return SENTINEL_FILE.exists
  } catch {
    // 读不出来时保守当作「已存在」，避免误清用户凭据
    return true
  }
}

export async function markInstallSentinel(): Promise<void> {
  try {
    if (!SENTINEL_DIR.exists) SENTINEL_DIR.create({ intermediates: true })
    if (!SENTINEL_FILE.exists) SENTINEL_FILE.create()
  } catch {
    // 写失败不致命：下次启动会再判一次（顶多多清一次，用户重登即可）
  }
}
