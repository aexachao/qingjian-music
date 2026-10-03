import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import { StorageMutationQueue } from './storage-mutation-queue'
import { createHydrationQueue } from './hydration-queue'

const KEY_LOCAL_FAVORITES = 'qj.store.local_favorites.v1'

export interface LocalFavoriteAlbum {
  id: string
  name: string
  coverId?: string | null
  artistName?: string
  trackCount?: number
  savedAt: number
}

export interface LocalFavoritePlaylist {
  id: string
  name: string
  coverId?: string | null
  trackCount?: number
  savedAt: number
}

export interface LocalFavoriteArtist {
  id: string
  name: string
  coverId?: string | null
  trackCount?: number
  savedAt: number
}

export const EMPTY_FAVORITE_ALBUMS: readonly LocalFavoriteAlbum[] = Object.freeze([])
export const EMPTY_FAVORITE_PLAYLISTS: readonly LocalFavoritePlaylist[] = Object.freeze([])
export const EMPTY_FAVORITE_ARTISTS: readonly LocalFavoriteArtist[] = Object.freeze([])

interface LocalFavoritesPersistedData {
  albumsByServer: Record<string, LocalFavoriteAlbum[]>
  playlistsByServer: Record<string, LocalFavoritePlaylist[]>
  artistsByServer: Record<string, LocalFavoriteArtist[]>
}

interface LocalFavoritesStore extends LocalFavoritesPersistedData {
  hydrated: boolean
  toggleAlbum: (serverId: string, album: Omit<LocalFavoriteAlbum, 'savedAt'>) => boolean
  isAlbumFavorited: (serverId: string, albumId: string) => boolean
  getFavoriteAlbums: (serverId: string) => LocalFavoriteAlbum[]
  togglePlaylist: (serverId: string, playlist: Omit<LocalFavoritePlaylist, 'savedAt'>) => boolean
  isPlaylistFavorited: (serverId: string, playlistId: string) => boolean
  getFavoritePlaylists: (serverId: string) => LocalFavoritePlaylist[]
  toggleArtist: (serverId: string, artist: Omit<LocalFavoriteArtist, 'savedAt'>) => boolean
  isArtistFavorited: (serverId: string, artistId: string) => boolean
  getFavoriteArtists: (serverId: string) => LocalFavoriteArtist[]
}

const storageWrites = new StorageMutationQueue()

async function persistToStorage(data: LocalFavoritesPersistedData) {
  try {
    await storageWrites.run(() => SecureStore.setItemAsync(KEY_LOCAL_FAVORITES, JSON.stringify(data)))
  } catch {
    // 忽略持久化失败
  }
}

const hydration = createHydrationQueue<LocalFavoritesPersistedData>()

function ensureHydrated(): void {
  void hydration.hydrate(async () => {
    const raw = await SecureStore.getItemAsync(KEY_LOCAL_FAVORITES)
    const parsed = raw ? (JSON.parse(raw) as Partial<LocalFavoritesPersistedData>) : {}
    return {
      albumsByServer: parsed.albumsByServer ?? {},
      playlistsByServer: parsed.playlistsByServer ?? {},
      artistsByServer: parsed.artistsByServer ?? {},
    }
  }, (data, replayed) => {
    useLocalFavoritesStore.setState({ ...data, hydrated: true })
    if (replayed) void persistToStorage(data)
  })
}

export const useLocalFavoritesStore = create<LocalFavoritesStore>((set, get) => ({
  hydrated: false,
  albumsByServer: {},
  playlistsByServer: {},
  artistsByServer: {},

  toggleAlbum: (serverId, album) => {
    const savedAlbum = { ...album, savedAt: Date.now() }
    const state = get()
    const list = state.albumsByServer[serverId] ?? []
    const exists = list.some((item) => item.id === album.id)
    const shouldExist = !exists
    hydration.queue((data) => {
      const persisted = data.albumsByServer[serverId] ?? []
      const hasItem = persisted.some((item) => item.id === album.id)
      const next = shouldExist
        ? hasItem ? persisted : [savedAlbum, ...persisted]
        : persisted.filter((item) => item.id !== album.id)
      return { ...data, albumsByServer: { ...data.albumsByServer, [serverId]: next } }
    })
    const nextList = exists
      ? list.filter((item) => item.id !== album.id)
      : [savedAlbum, ...list]

    const nextAlbums = { ...state.albumsByServer, [serverId]: nextList }
    set({ albumsByServer: nextAlbums })
    const persisted = {
      albumsByServer: nextAlbums,
      playlistsByServer: state.playlistsByServer,
      artistsByServer: state.artistsByServer,
    }
    if (hydration.hydrated) void persistToStorage(persisted)
    else ensureHydrated()
    return !exists
  },

  isAlbumFavorited: (serverId, albumId) => {
    const list = get().albumsByServer[serverId] ?? []
    return list.some((item) => item.id === albumId)
  },

  getFavoriteAlbums: (serverId) => {
    return get().albumsByServer[serverId] ?? (EMPTY_FAVORITE_ALBUMS as LocalFavoriteAlbum[])
  },

  togglePlaylist: (serverId, playlist) => {
    const savedPlaylist = { ...playlist, savedAt: Date.now() }
    const state = get()
    const list = state.playlistsByServer[serverId] ?? []
    const exists = list.some((item) => item.id === playlist.id)
    const shouldExist = !exists
    hydration.queue((data) => {
      const persisted = data.playlistsByServer[serverId] ?? []
      const hasItem = persisted.some((item) => item.id === playlist.id)
      const next = shouldExist
        ? hasItem ? persisted : [savedPlaylist, ...persisted]
        : persisted.filter((item) => item.id !== playlist.id)
      return { ...data, playlistsByServer: { ...data.playlistsByServer, [serverId]: next } }
    })
    const nextList = exists
      ? list.filter((item) => item.id !== playlist.id)
      : [savedPlaylist, ...list]

    const nextPlaylists = { ...state.playlistsByServer, [serverId]: nextList }
    set({ playlistsByServer: nextPlaylists })
    const persisted = {
      albumsByServer: state.albumsByServer,
      playlistsByServer: nextPlaylists,
      artistsByServer: state.artistsByServer,
    }
    if (hydration.hydrated) void persistToStorage(persisted)
    else ensureHydrated()
    return !exists
  },

  isPlaylistFavorited: (serverId, playlistId) => {
    const list = get().playlistsByServer[serverId] ?? []
    return list.some((item) => item.id === playlistId)
  },

  getFavoritePlaylists: (serverId) => {
    return get().playlistsByServer[serverId] ?? (EMPTY_FAVORITE_PLAYLISTS as LocalFavoritePlaylist[])
  },

  toggleArtist: (serverId, artist) => {
    const savedArtist = { ...artist, savedAt: Date.now() }
    const state = get()
    const list = state.artistsByServer[serverId] ?? []
    const exists = list.some((item) => item.id === artist.id)
    const shouldExist = !exists
    hydration.queue((data) => {
      const persisted = data.artistsByServer[serverId] ?? []
      const hasItem = persisted.some((item) => item.id === artist.id)
      const next = shouldExist
        ? hasItem ? persisted : [savedArtist, ...persisted]
        : persisted.filter((item) => item.id !== artist.id)
      return { ...data, artistsByServer: { ...data.artistsByServer, [serverId]: next } }
    })
    const nextList = exists
      ? list.filter((item) => item.id !== artist.id)
      : [savedArtist, ...list]

    const nextArtists = { ...state.artistsByServer, [serverId]: nextList }
    set({ artistsByServer: nextArtists })
    const persisted = {
      albumsByServer: state.albumsByServer,
      playlistsByServer: state.playlistsByServer,
      artistsByServer: nextArtists,
    }
    if (hydration.hydrated) void persistToStorage(persisted)
    else ensureHydrated()
    return !exists
  },

  isArtistFavorited: (serverId, artistId) => {
    const list = get().artistsByServer[serverId] ?? []
    return list.some((item) => item.id === artistId)
  },

  getFavoriteArtists: (serverId) => {
    return get().artistsByServer[serverId] ?? (EMPTY_FAVORITE_ARTISTS as LocalFavoriteArtist[])
  },
}))

// 初始化异步水合
ensureHydrated()
