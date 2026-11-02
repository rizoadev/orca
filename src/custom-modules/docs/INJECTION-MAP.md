# Injection Map — Semua Touch Points Upstream

Dokumen ini mencatat **tepat di mana dan apa** yang di-inject ke upstream files.
Update dokumen ini setiap kali ada injection baru.

Last updated: setelah hero + cloudflare module.

---

## Ringkasan

| #   | File Upstream                                                         | Modul      | Yang Di-inject                            |
| --- | --------------------------------------------------------------------- | ---------- | ----------------------------------------- |
| 1   | `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`       | hero       | import + `<MainWindowHero>`               |
| 2   | `src/renderer/src/assets/main.css`                                    | hero       | `@import` CSS                             |
| 3   | `src/shared/global-settings-types.ts`                                 | cloudflare | 3 optional fields                         |
| 4   | `src/shared/cloudflare-relay-status.ts`                               | cloudflare | file baru (kita buat)                     |
| 5   | `src/preload/api/mobile-api.ts`                                       | cloudflare | import type + 3 method types              |
| 6   | `src/preload/api/mobile-bridge.ts`                                    | cloudflare | 3 `ipcRenderer.invoke` calls              |
| 7   | `src/main/ipc/mobile.ts`                                              | cloudflare | import + 1 function call                  |
| 8   | `src/renderer/src/components/settings/MobilePane.tsx`                 | cloudflare | import + `<CloudflareRelaySection />`     |
| 9   | `src/renderer/src/components/status-bar/StatusBarSurface.tsx`         | cloudflare | import + `<CloudflareRelayStatusSegment>` |
| 10  | `src/renderer/src/components/settings/RuntimePairingUrlGenerator.tsx` | cloudflare | import + `<CloudflareRuntimeHint>`        |

**Total: 10 touch points, semua additive (tidak ada edit ke logika upstream).**

---

## Detail Per File

---

### 1. `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`

**Modul**: `custom-modules/hero`
**Mengapa file ini**: Layout utama workspace tab — wraps editor/terminal area setiap workspace aktif.

```tsx
// Tambah setelah import terakhir:
import { MainWindowHero } from '../../../../custom-modules/MainWindowHero'

// Tambah setelah div data-terminal-focus-release-surface:
;<MainWindowHero worktreeId={worktreeId} />
```

**Marker untuk re-inject**: cari `data-terminal-focus-release-surface`

---

### 2. `src/renderer/src/assets/main.css`

**Modul**: `custom-modules/hero`
**Mengapa file ini**: Entry point CSS app — satu-satunya cara inject stylesheet global ke renderer.

```css
/* Tambah setelah @import terakhir: */
@import '../../../custom-modules/hero/pet-hero.css';
```

**Marker untuk re-inject**: append setelah baris `@import` terakhir

---

### 3. `src/shared/global-settings-types.ts`

**Modul**: `custom-modules/cloudflare`
**Mengapa file ini**: Shared settings schema — satu-satunya place untuk persist cloudflare token/domain/hostname ke disk.

```typescript
// Tambah setelah `mobilePairingCustomAddresses?: string[]`:
/** Cloudflare API token (Account-Tunnel:Edit, Zone-DNS:Edit). custom-modules/cloudflare */
cloudflareRelayToken?: string
/** Domain on Cloudflare, e.g. example.com. custom-modules/cloudflare */
cloudflareRelayDomain?: string
/** Active tunnel hostname written by CloudflareRelayService after provisioning. custom-modules/cloudflare */
cloudflareRelayHostname?: string
```

**Catatan**: `cloudflareRelayEnabled` tidak di-inject karena `CloudflareRelayService` menggunakan
keberadaan token + domain sebagai on-switch, bukan field enabled terpisah.

**Marker untuk re-inject**: cari `mobilePairingCustomAddresses`

---

### 4. `src/shared/cloudflare-relay-status.ts`

**Modul**: `custom-modules/cloudflare`
**Mengapa di shared/**: `preload/api/mobile-api.ts` import type dari sini — preload tidak bisa
import dari `custom-modules/` karena di luar src/shared scope Electron preload.

**Ini file baru yang kita buat**, bukan edit file existing:

```typescript
export type CloudflareRelayStatusState = 'disabled' | 'provisioning' | 'running' | 'error'

export type CloudflareRelayStatusPayload = {
  configured: boolean
  state: CloudflareRelayStatusState
  hostname: string
  message?: string
  wsPort: number | null
}
```

**Re-inject**: buat ulang file jika tidak ada.

---

### 5. `src/preload/api/mobile-api.ts`

**Modul**: `custom-modules/cloudflare`
**Mengapa file ini**: Type definition `MobileApi` — renderer `window.api.mobile` typed dari sini.

```typescript
// Tambah import:
import type { CloudflareRelayStatusPayload } from '../../shared/cloudflare-relay-status'

// Tambah ke MobileApi type, setelah onUnpairedDeviceAuthFailure:
// ── Cloudflare Tunnel (custom-modules/cloudflare) ──────────────────────────
getCloudflareRelayStatus?: () => Promise<CloudflareRelayStatusPayload>
restartCloudflareRelay?: () => Promise<{ ok: boolean; error?: string }>
setCloudflareRelay?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
```

**Marker untuk re-inject**: cari `onUnpairedDeviceAuthFailure`

---

### 6. `src/preload/api/mobile-bridge.ts`

**Modul**: `custom-modules/cloudflare`
**Mengapa file ini**: Implementasi aktual bridge — ini yang benar-benar expose method ke
`window.api.mobile` via `ipcRenderer.invoke`. **Tanpa ini, method ada di type tapi tidak bisa dipanggil.**

```typescript
// Tambah sebelum `} satisfies PreloadApi['mobile']`:
// ── Cloudflare Tunnel (custom-modules/cloudflare) ──────────────────
getCloudflareRelayStatus: () => ipcRenderer.invoke('mobile:getCloudflareRelayStatus'),
restartCloudflareRelay: () => ipcRenderer.invoke('mobile:restartCloudflareRelay'),
setCloudflareRelay: (enabled: boolean) => ipcRenderer.invoke('mobile:setCloudflareRelay', enabled)
```

**Marker untuk re-inject**: cari `} satisfies PreloadApi['mobile']`

---

### 7. `src/main/ipc/mobile.ts`

**Modul**: `custom-modules/cloudflare`
**Mengapa file ini**: Main process IPC registration — handlers harus didaftarkan di sini
agar `ipcMain.handle('mobile:*')` aktif.

```typescript
// Tambah import (setelah import terakhir di atas):
import { registerCloudflareRelayHandlers } from '../../custom-modules/cloudflare/main/cloudflare-relay-ipc'

// Tambah sebagai baris pertama di dalam registerMobileHandlers():
registerCloudflareRelayHandlers() // custom-modules/cloudflare
```

**Marker untuk re-inject**: cari `export function registerMobileHandlers`

---

### 8. `src/renderer/src/components/settings/MobilePane.tsx`

**Modul**: `custom-modules/cloudflare`
**Mengapa file ini**: Settings Mobile page — natural place untuk cloudflare tunnel config UI,
di bawah `MobileAutoRestoreFitSection`.

```tsx
// Tambah import:
import { CloudflareRelaySection } from '../../../../custom-modules/cloudflare/CloudflareRelaySection'

// Tambah setelah <MobileAutoRestoreFitSection ... />:
;<CloudflareRelaySection />
```

**Marker untuk re-inject**: cari `MobileAutoRestoreFitSection`

---

### 9. `src/renderer/src/components/status-bar/StatusBarSurface.tsx`

**Modul**: `custom-modules/cloudflare`
**Mengapa file ini**: Status bar footer — di sini ada `SshStatusSegment` (Remote Hosts).
Cloudflare tunnel status segment ditempatkan tepat setelahnya.

```tsx
// Tambah import:
import { CloudflareRelayStatusSegment } from '../../../../custom-modules/cloudflare/CloudflareRelayStatusSegment'

// Tambah setelah <SshStatusSegment ...>:
;<CloudflareRelayStatusSegment compact={compact} iconOnly={segmentsIconOnly} />
```

**Marker untuk re-inject**: cari `SshStatusSegment`

---

## Checklist Re-inject Setelah Upstream Merge

```bash
# Quick verify — semua harus ada:
grep -c 'MainWindowHero' src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx
grep -c 'custom-modules/hero' src/renderer/src/assets/main.css
grep -c 'cloudflareRelayToken' src/shared/global-settings-types.ts
test -f src/shared/cloudflare-relay-status.ts && echo "exists" || echo "MISSING"
grep -c 'cloudflare-relay-status' src/preload/api/mobile-api.ts
grep -c 'getCloudflareRelayStatus' src/preload/api/mobile-bridge.ts
grep -c 'registerCloudflareRelayHandlers' src/main/ipc/mobile.ts
grep -c 'CloudflareRelaySection' src/renderer/src/components/settings/MobilePane.tsx
grep -c 'CloudflareRelayStatusSegment' src/renderer/src/components/status-bar/StatusBarSurface.tsx
```

Semua harus output `1` atau `exists`. Jika ada yang `0` atau `MISSING`, re-apply
baris yang ada di dokumen ini, atau jalankan `inject-custom-modules.sh`.

---

## Files Custom Modules (tidak pernah disentuh upstream)

```
src/custom-modules/
├── MainWindowHero.tsx                          ← bridge hero → upstream
├── inject-custom-modules.sh                   ← re-inject script
├── hero/
│   ├── PetHeroBanner.tsx
│   ├── pet-hero.css
│   ├── motto-store.ts
│   ├── panel.tsx
│   └── renderer/src/components/right-sidebar/pomodoro-timer-store.ts
└── cloudflare/
    ├── CloudflareRelaySection.tsx              ← Settings UI
    ├── CloudflareRelayStatusSegment.tsx        ← Status bar widget
    ├── shared/cloudflare-relay-status.ts       ← Local type copy
    └── main/
        ├── cloudflare-relay-ipc.ts             ← IPC handlers
        ├── persistence/index.ts
        └── runtime/cloudflare-relay/
            ├── cloudflare-relay.ts             ← CloudflareRelayService
            └── cloudflare-relay-provision.ts   ← Cloudflare API

resources/
├── cat-playing.svg
├── cat-watermelon.svg
├── cat-dance.svg
└── mountain-landscape-transparent.svg

src/shared/cloudflare-relay-status.ts           ← Shared type (kita buat, bukan upstream)
```

---

### 10. `src/renderer/src/components/settings/RuntimePairingUrlGenerator.tsx`

**Modul**: `custom-modules/cloudflare`
**Mengapa file ini**: Dialog "Share this computer" (Remote Orca Servers) — tempat user
generate pairing URL untuk connect dari Orca lain. Cloudflare tunnel adalah opsi
address yang ideal untuk koneksi dari mana saja.

```tsx
// Tambah import:
import { CloudflareRuntimeHint } from '../../../../custom-modules/cloudflare/CloudflareRuntimeHint'

// Tambah setelah blok showGeneratorForm (sebelum RuntimeAccessGrantList):
;<CloudflareRuntimeHint
  onUse={(address) => {
    updateIntent('custom')
    updateSelectedAddress(address)
  }}
/>
```

**Cara kerja**: `CloudflareRuntimeHint` baca `settings.cloudflareRelayHostname` dari
Zustand store. Jika tunnel aktif (hostname tidak kosong), tampilkan banner kecil dengan
tombol "Pakai" — klik → auto-set intent ke `'custom'` dan address ke `wss://<hostname>`.
User tinggal klik "Create link".

**Marker untuk re-inject**: cari `RuntimeAccessGrantList` di file ini.
