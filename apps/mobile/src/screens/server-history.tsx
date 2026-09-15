import { useCallback, useEffect, useRef } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import Swipeable from 'react-native-gesture-handler/Swipeable'
import type { ServerConnection } from '@qj/provider-api'
import { Icon, iconSize } from '@/components/icon'
import { useConfirm } from '@/components/confirm-modal'
import { useToast } from '@/components/toast'
import { useBottomSpace } from '@/lib/bottom-space'
import { useServerSession } from '@/lib/server-session'
import { radius, spacing, typography } from '@/theme/tokens'
import { createThemedStyles, useThemeColors } from '@/theme/theme-provider'

/** 判定「这是一次点击而不是滑动」的容差，与队列行一致 */
const TAP_SLOP = 8

/**
 * 同一时刻只允许一行处于展开态。滑动一行时先把上一行收起来，
 * 否则多行同时摊开，屏幕上会出现好几个删除按钮。
 */
let openSwipeableRef: Swipeable | null = null

function closeOpenSwipe(): boolean {
  if (!openSwipeableRef) return false
  openSwipeableRef.close()
  openSwipeableRef = null
  return true
}

/**
 * 历史服务器（二级页面）。
 *
 * 这里**只做两件事**：选中一台去登录，或左滑删掉一台。没有「切换」——
 * 客户端不支持服务器切换，换服务器就是「退出登录 → 在这里选一台 → 重新登录」。
 *
 * 为什么是二级页面而不是弹窗：弹窗（OptionPickerModal）只是一列可选项，
 * 塞不下左滑删除这种带手势的行操作；而且删除是破坏性动作，需要一个能容纳
 * 二次确认的安全位置。
 */
export function ServerHistoryScreen() {
  const styles = useStyles()
  const bottom = useBottomSpace()
  const router = useRouter()
  const confirm = useConfirm()
  const toast = useToast()
  const { servers, removeServer } = useServerSession()

  const onSelect = useCallback(
    (serverId: string) => {
      // 回登录页并带上选择，由登录页负责回填地址 / 账号 / 已保存的密码
      router.replace({ pathname: '/login', params: { serverId } })
    },
    [router],
  )

  const onRemove = useCallback(
    (server: ServerConnection) => {
      confirm({
        title: '删除服务器',
        message: `确定删除“${server.displayName}”及其保存在本机的登录信息吗？`,
        confirmText: '删除',
        destructive: true,
        onConfirm: async () => {
          try {
            await removeServer(server.id)
            toast('服务器已删除')
          } catch (error) {
            toast(error instanceof Error ? error.message : '删除失败')
          }
        },
      })
    },
    [confirm, removeServer, toast],
  )

  if (servers.length === 0) {
    return (
      <View style={[styles.screen, styles.empty]}>
        <Text style={styles.emptyText}>还没有登录过的服务器</Text>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {servers.map((server, index) => (
            <View key={server.id}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <ServerRow server={server} onSelect={onSelect} onRemove={onRemove} />
            </View>
          ))}
        </View>
        <Text style={styles.footer}>点一下用这台服务器登录，左滑可以删除。</Text>
      </ScrollView>
    </View>
  )
}

function ServerRow({
  server,
  onSelect,
  onRemove,
}: {
  server: ServerConnection
  onSelect: (serverId: string) => void
  onRemove: (server: ServerConnection) => void
}) {
  const styles = useStyles()
  const colors = useThemeColors()
  const swipeableRef = useRef<Swipeable>(null)
  const startX = useRef(0)
  const startY = useRef(0)
  const moved = useRef(false)

  useEffect(
    () => () => {
      if (openSwipeableRef === swipeableRef.current) openSwipeableRef = null
    },
    [],
  )

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<string | number>,
    dragX: Animated.AnimatedInterpolation<string | number>,
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-88, 0],
      outputRange: [0, 88],
      extrapolate: 'clamp',
    })
    return (
      <Animated.View style={{ transform: [{ translateX }] }}>
        <Pressable
          style={styles.deleteAction}
          onPress={() => onRemove(server)}
          accessibilityRole="button"
          accessibilityLabel={`删除服务器 ${server.displayName}`}
        >
          <Icon name="trash" size={iconSize.md} color={colors.textOnAccent} />
        </Pressable>
      </Animated.View>
    )
  }

  return (
    <Swipeable
      ref={swipeableRef}
      dragOffsetFromRightEdge={20}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
      overshootFriction={8}
      containerStyle={styles.swipeContainer}
      onSwipeableWillOpen={() => {
        if (openSwipeableRef && openSwipeableRef !== swipeableRef.current) closeOpenSwipe()
        openSwipeableRef = swipeableRef.current
      }}
      onSwipeableClose={() => {
        if (openSwipeableRef !== swipeableRef.current) return
        openSwipeableRef = null
      }}
    >
      <Pressable
        onTouchStart={(event) => {
          startX.current = event.nativeEvent.pageX
          startY.current = event.nativeEvent.pageY
          moved.current = false
        }}
        onTouchMove={(event) => {
          const { pageX, pageY } = event.nativeEvent
          if (Math.abs(pageX - startX.current) > TAP_SLOP || Math.abs(pageY - startY.current) > TAP_SLOP) {
            moved.current = true
          }
        }}
        onPress={() => {
          if (moved.current) return
          // 已经摊开删除按钮时，点一下先收起来，别顺手就把人送去登录
          if (closeOpenSwipe()) return
          onSelect(server.id)
        }}
        style={styles.row}
        accessibilityRole="button"
        accessibilityLabel={`用 ${server.displayName} 登录`}
      >
        <Icon name="server" size={iconSize.lg} color={colors.iconMid} />
        <View style={styles.info}>
          <Text numberOfLines={1} style={styles.name}>
            {server.displayName}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {server.baseUrl} · {server.username}
          </Text>
        </View>
        <Icon name="chevronRight" size={16} color={colors.textQuaternary} />
      </Pressable>
    </Swipeable>
  )
}

const useStyles = createThemedStyles((colors) => ({
  screen: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: spacing.lg },
  empty: { alignItems: 'center', justifyContent: 'center' },
  emptyText: { ...typography.callout, color: colors.textTertiary },
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, overflow: 'hidden' },
  swipeContainer: { overflow: 'visible' },
  row: {
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgCard,
  },
  info: { flex: 1, gap: spacing.xs },
  name: { ...typography.callout, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textTertiary },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.borderDefault, marginLeft: 52 },
  deleteAction: {
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    width: 88,
    height: '100%',
  },
  footer: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.md },
}))
