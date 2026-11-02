import { create } from 'zustand'

const STORAGE_KEY = 'orca-pet-hero-motto'
const DEFAULT_MOTTO = 'Semangat kerja ya — buat nabung rumah.'

type MottoStore = {
  motto: string
  setMotto: (motto: string) => void
}

function loadMotto(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MOTTO
  } catch {
    return DEFAULT_MOTTO
  }
}

export const useMottoStore = create<MottoStore>()((set) => ({
  motto: loadMotto(),
  setMotto: (motto: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, motto)
    } catch {
      // storage full or restricted
    }
    set({ motto })
  }
}))
