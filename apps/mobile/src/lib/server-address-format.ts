/**
 * 格式化用于展示的服务器地址：
 * 1. http、HTTPS 的服务器地址不显示前面的 http://、https://
 * 2. 属于飞牛官方中继域名的 FN ID（.fnos.net / .5ddd.com / .trzznas.com）只显示 id 本身，不显示完整域名
 */
export function formatServerAddress(url?: string): string {
  if (!url) return '—'
  let clean = url.trim().replace(/\/+$/, '')
  clean = clean.replace(/^https?:\/\//i, '')
  const host = clean.split(/[:/]/)[0] ?? ''
  for (const domain of ['fnos.net', '5ddd.com', 'trzznas.com']) {
    const suffix = '.' + domain
    if (host.toLowerCase().endsWith(suffix)) {
      const fnId = host.slice(0, -suffix.length)
      if (fnId) return fnId
    }
  }
  return clean
}
