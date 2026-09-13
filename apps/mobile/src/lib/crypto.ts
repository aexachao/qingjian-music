import * as Crypto from 'expo-crypto'

/** 飞牛登录要求把明文密码先做 sha256（十六进制小写） */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
    encoding: Crypto.CryptoEncoding.HEX,
  })
  return digest.toLowerCase()
}

/** FN Connect authx 签名要求 md5（十六进制小写） */
export async function md5Hex(input: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.MD5, input, {
    encoding: Crypto.CryptoEncoding.HEX,
  })
  return digest.toLowerCase()
}
