import { useEffect, useState } from 'react'

type Listener = (isOpen: boolean) => void

let isMenuOpenGlobal = false
let menuClosedAtGlobal = 0
const listeners = new Set<Listener>()

/**
 * 标记全局快捷菜单的开闭状态
 */
export function setGlobalMenuOpen(open: boolean) {
  isMenuOpenGlobal = open
  if (!open) {
    menuClosedAtGlobal = Date.now()
  }
  for (const listener of listeners) {
    listener(open)
  }
}

/**
 * 判断当前是否正处于快捷菜单交互或退出后的 450ms 冷却保护期
 * 用于阻断底层所有由于退出点击导致的误触（如切歌、跳转页面等）
 */
export function isGlobalMenuInteracting(): boolean {
  return isMenuOpenGlobal || Date.now() - menuClosedAtGlobal < 450
}

/**
 * React 钩子：订阅全局是否有快捷菜单处于展示状态
 * 用于各页面在顶层挂载全屏透明拦截遮罩
 */
export function useIsMenuOpen(): boolean {
  const [isOpen, setIsOpen] = useState(isMenuOpenGlobal)

  useEffect(() => {
    listeners.add(setIsOpen)
    return () => {
      listeners.delete(setIsOpen)
    }
  }, [])

  return isOpen
}
