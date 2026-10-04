import type { StyleProp, ViewStyle } from 'react-native'

const hitArea: ViewStyle = {
  width: 44,
  height: 44,
  borderRadius: 22,
  alignItems: 'center',
  justifyContent: 'center',
}

/** Keep a Pressable directly in the native Stack header so iOS retains its button material. */
export function stackHeaderIconStyle(pressed: boolean, pressedColor: string): StyleProp<ViewStyle> {
  return [hitArea, pressed && { backgroundColor: pressedColor }]
}
