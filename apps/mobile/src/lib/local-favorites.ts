import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'

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

async function persistToStorage(data: LocalFavoritesPersistedData) {
  try {
    await SecureStore.setItemAsync(KEY_LOCAL_FAVORITES, JSON.stringify(data))
  } catch {
    // 忽略持久化失败
  }
}

export const useLocalFavoritesStore = create<LocalFavoritesStore>((set, get) => ({
  hydrated: false,
  albumsByServer: {},
  playlistsByServer: {},
  artistsByServer: {},

  toggleAlbum: (serverId, album) => {
    const state = get()
    const list = state.albumsByServer[serverId] ?? []
    const exists = list.some((item) => item.id === album.id)
    const nextList = exists
      ? list.filter((item) => item.id !== album.id)
      : [{ ...album, savedAt: Date.now() }, ...list]

    const nextAlbums = { ...state.albumsByServer, [serverId]: nextList }
    set({ albumsByServer: nextAlbums })
    void persistToStorage({
      albumsByServer: nextAlbums,
      playlistsByServer: state.playlistsByServer,
      artistsByServer: state.artistsByServer,
    })
    return !exists
  },

  isAlbumFavorited: (serverId, albumId) => {
    const list = get().albumsByServer[serverId] ?? []
    return list.some((item) => item.id === albumId)
  },

  getFavoriteAlbums: (serverId) => {
    return get().albumsByServer[serverId] ?? []
  },

  togglePlaylist: (serverId, playlist) => {
    const state = get()
    const list = state.playlistsByServer[serverId] ?? []
    const exists = list.some((item) => item.id === playlist.id)
    const nextList = exists
      ? list.filter((item) => item.id !== playlist.id)
      : [{ ...playlist, savedAt: Date.now() }, ...list]

    const nextPlaylists = { ...state.playlistsByServer, [serverId]: nextList }
    set({ playlistsByServer: nextPlaylists })
    void persistToStorage({
      albumsByServer: state.albumsByServer,
      playlistsByServer: nextPlaylists,
      artistsByServer: state.artistsByServer,
    })
    return !exists
  },

  isPlaylistFavorited: (serverId, playlistId) => {
    const list = get().playlistsByServer[serverId] ?? []
    return list.some((item) => item.id === playlistId)
  },

  getFavoritePlaylists: (serverId) => {
    return get().playlistsByServer[serverId] ?? []
  },

  toggleArtist: (serverId, artist) => {
    const state = get()
    const list = state.artistsByServer[serverId] ?? []
    const exists = list.some((item) => item.id === artist.id)
    const nextList = exists
      ? list.filter((item) => item.id !== artist.id)
      : [{ ...artist, savedAt: Date.now() }, ...list]

    const nextArtists = { ...state.artistsByServer, [serverId]: nextList }
    set({ artistsByServer: nextArtists })
    void persistToStorage({
      albumsByServer: state.albumsByServer,
      playlistsByServer: state.playlistsByServer,
      artistsByServer: nextArtists,
    })
    return !exists
  },

  isArtistFavorited: (serverId, artistId) => {
    const list = get().artistsByServer[serverId] ?? []
    return list.some((item) => item.id === artistId)
  },

  getFavoriteArtists: (serverId) => {
    return get().artistsByServer[serverId] ?? []
  },
}))

// 初始化异步水合
void (async () => {
  try {
    const raw = await SecureStore.getItemAsync(KEY_LOCAL_FAVORITES)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalFavoritesPersistedData>
      useLocalFavoritesStore.setState({
        hydrated: true,
        albumsByServer: parsed.albumsByServer ?? {},
        playlistsByServer: parsed.playlistsByServer ?? {},
        artistsByServer: parsed.artistsByServer ?? {},
      })
      return
    }
  } catch {
    // 降级为默认空状态
  }
  useLocalFavoritesStore.setState({ hydrated: true })
})()
