import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AccessibilityInfo, AppState } from 'react-native'

export const LYRICS_CONTROLS_IDLE_MS = 4000

type VisibilityAction = 'show' | 'hide' | 'toggle' | 'restart'
function visibilityReducer(state: { visible: boolean; revision: number }, action: VisibilityAction) {
  const visible = action === 'show' ? true : action === 'hide' ? false : action === 'toggle' ? !state.visible : state.visible
  return { visible, revision: state.revision + 1 }
}

/** One orientation-independent owner for lyrics chrome visibility and idle timing. */
export function useLyricsControls({ active, identity, playing, ready, locked, forceVisible = false }: {
  active: boolean
  identity: string
  playing: boolean
  ready: boolean
  /** Modal/menu locks preserve the current visibility; recoverable loading belongs in forceVisible. */
  locked: boolean
  forceVisible?: boolean
}) {
  const [state, dispatch] = useReducer(visibilityReducer, { visible: true, revision: 0 })
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false)
  const [foreground, setForeground] = useState(AppState.currentState === 'active')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const interactionCount = useRef(0)
  const previousActive = useRef(active)
  const previousIdentity = useRef(identity)
  const mandatoryVisible = !playing || !ready || forceVisible
  const previousMandatory = useRef(mandatoryVisible)

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const show = useCallback(() => { clearTimer(); dispatch('show') }, [clearTimer])
  const hide = useCallback(() => {
    clearTimer()
    const canHide = active && foreground && playing && ready && !locked && !forceVisible && !screenReaderEnabled
    dispatch(canHide ? 'hide' : 'show')
  }, [active, foreground, playing, ready, locked, forceVisible, screenReaderEnabled, clearTimer])
  const toggle = useCallback(() => {
    clearTimer()
    const canHide = active && foreground && playing && ready && !locked && !forceVisible && !screenReaderEnabled
    dispatch(canHide ? 'toggle' : 'show')
  }, [active, foreground, playing, ready, locked, forceVisible, screenReaderEnabled, clearTimer])
  const touchStart = useCallback(() => { interactionCount.current += 1; clearTimer() }, [clearTimer])
  const touchEnd = useCallback(() => {
    interactionCount.current = Math.max(0, interactionCount.current - 1)
    dispatch('restart')
  }, [])

  useEffect(() => {
    if (identity !== previousIdentity.current) {
      previousIdentity.current = identity
      interactionCount.current = 0
      show()
    }
  }, [identity, show])
  useEffect(() => {
    if (active && !previousActive.current) show()
    if (!active) { interactionCount.current = 0; clearTimer() }
    previousActive.current = active
  }, [active, clearTimer, show])
  useEffect(() => {
    if (mandatoryVisible && !previousMandatory.current) show()
    previousMandatory.current = mandatoryVisible
  }, [mandatoryVisible, show])
  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (mounted) setScreenReaderEnabled(enabled)
    }).catch(() => {})
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReaderEnabled)
    return () => { mounted = false; subscription.remove() }
  }, [])
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const next = nextState === 'active'
      setForeground(next)
      clearTimer()
      if (next && active) show()
    })
    return () => subscription.remove()
  }, [active, clearTimer, show])
  useEffect(() => {
    clearTimer()
    if (active && foreground && playing && ready && !locked && !forceVisible && !screenReaderEnabled && state.visible && interactionCount.current === 0) {
      timer.current = setTimeout(() => {
        timer.current = null
        if (interactionCount.current === 0) dispatch('hide')
      }, LYRICS_CONTROLS_IDLE_MS)
    }
    return clearTimer
  }, [active, identity, foreground, playing, ready, locked, forceVisible, screenReaderEnabled, state.visible, state.revision, clearTimer])

  return { visible: state.visible || screenReaderEnabled || (active && mandatoryVisible), screenReaderEnabled, foreground, touchStart, touchEnd, toggle, show, hide }
}
