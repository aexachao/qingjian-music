export interface SortSpec {
  field: string
  order: 'asc' | 'desc'
}

export interface PageRequest {
  /** 1 起 */
  page: number
  size: number
  sort?: SortSpec
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
  hasMore: boolean
}

export const DEFAULT_PAGE_SIZE = 50

export function firstPage(size: number = DEFAULT_PAGE_SIZE, sort?: SortSpec): PageRequest {
  return sort ? { page: 1, size, sort } : { page: 1, size }
}

export function makePage<T>(items: T[], total: number, request: PageRequest): Page<T> {
  return {
    items,
    total,
    page: request.page,
    size: request.size,
    // 飞牛这类「page/size + total」接口没有 nextCursor，只能这样判断
    hasMore: items.length === request.size && request.page * request.size < total,
  }
}

export function nextPageNumber<T>(page: Page<T>): number | undefined {
  return page.hasMore ? page.page + 1 : undefined
}

export function emptyPage<T>(request: PageRequest): Page<T> {
  return { items: [], total: 0, page: request.page, size: request.size, hasMore: false }
}
