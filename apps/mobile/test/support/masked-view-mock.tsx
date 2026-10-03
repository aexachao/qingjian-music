import React from 'react'
import { View, type ViewProps } from 'react-native'

export default function MaskedView({
  children,
  maskElement: _maskElement,
  ...props
}: ViewProps & { maskElement?: React.ReactNode }) {
  return <View {...props}>{children}</View>
}
