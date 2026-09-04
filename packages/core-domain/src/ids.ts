/** provider 侧的原生实体 id（飞牛是 guid，Emby 是 Id） */
export type EntityId = string

/** 本地保存的一条「服务器 + 账号」配置的 id */
export type ServerId = string

/**
 * 跨服务器唯一 id，形如 `serverId:entityId`。
 * UI 列表 key、播放队列、本地缓存主键统一用它，避免多服务器实体串号。
 */
export type QualifiedId = string

const SEPARATOR = ':'

export function qualifyId(serverId: ServerId, entityId: EntityId): QualifiedId {
  if (!serverId || serverId.includes(SEPARATOR)) {
    throw new Error(`serverId 不合法: ${serverId}`)
  }
  if (!entityId) {
    throw new Error('entityId 不能为空')
  }
  return `${serverId}${SEPARATOR}${entityId}`
}

export function parseQualifiedId(id: QualifiedId): { serverId: ServerId; entityId: EntityId } {
  const index = id.indexOf(SEPARATOR)
  if (index <= 0 || index >= id.length - 1) {
    throw new Error(`QualifiedId 不合法: ${id}`)
  }
  return { serverId: id.slice(0, index), entityId: id.slice(index + 1) }
}
