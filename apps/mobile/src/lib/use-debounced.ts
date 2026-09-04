import { useEffect, useState } from 'react'

/** 输入防抖：搜索框边打字边请求会打爆后端，统一延后 delay 毫秒 */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
