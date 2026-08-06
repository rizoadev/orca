import { create } from 'zustand'

export type YouTubePlayerState = {
  videoId: string | null
  title: string
  uploader: string
  /** Player pinned at bottom of right sidebar; false hides it entirely. */
  open: boolean
  play: (videoId: string, title: string, uploader: string) => void
  close: () => void
}

export const useYouTubePlayerStore = create<YouTubePlayerState>((set) => ({
  videoId: null,
  title: '',
  uploader: '',
  open: false,
  play: (videoId, title, uploader) => set({ videoId, title, uploader, open: true }),
  close: () => set({ open: false })
}))
