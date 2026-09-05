/** 播放投递方式：直推（支持 Range 的渐进式）或 HLS（转码会话） */
export type StreamTransport = 'progressive' | 'hls'

export type PlayQuality = 'original' | 'high' | 'medium' | 'low'

/**
 * 一个「带鉴权头的 HTTP 资源」。
 * 飞牛不支持 query token，音频与封面都必须靠请求头鉴权，
 * 所以 provider 一律返回 url + headers，由播放器 / 图片组件自己带上。
 */
export interface HttpResource {
  url: string
  headers: Record<string, string>
}

/** 转码会话句柄：必须保活，退出时必须关闭，否则服务端会堆积转码进程 */
export interface StreamSession {
  id: string
  heartbeatIntervalMs: number
  /**
   * 保活。飞牛要求带当前播放位置（毫秒；服务端按秒收），
   * 且必须严格递增——具体约束由各 provider 内部消化。
   */
  heartbeat(positionMs: number): Promise<void>
  close(): Promise<void>
}

export interface StreamRequest extends HttpResource {
  transport: StreamTransport
  quality: PlayQuality
  mimeHint?: string
  session?: StreamSession
}

export interface StreamOptions {
  quality: PlayQuality
  /** 设备解不了原始格式时是否允许落到服务端转码 */
  allowTranscode: boolean
}
