# Cloudflare Tunnel untuk Mobile Pairing — Port Plan

## Tujuan

Menambahkan **Cloudflare Tunnel sebagai connection mode ketiga** di halaman Mobile
(`Settings → Mobile` / Mobile page), di samping:

- **Orca Relay** (automatic) — butuh sign-in Orca account
- **LAN** (local-only) — hanya di jaringan yang sama

Dengan Cloudflare Tunnel, phone bisa connect ke desktop dari mana saja **tanpa Orca
account** — tunnel dikelola sendiri pakai Cloudflare API token + domain.

---

## Arsitektur di orca-old

### Bagaimana Cloudflare module bekerja

```
Settings UI (CloudflareRelaySection)
  │  → window.api.mobile.setCloudflareRelay(true)
  │
Main Process (cloudflare-relay-ipc.ts)
  │  → CloudflareRelayService.provision()
  │     → download cloudflared binary jika belum ada
  │     → buat tunnel via Cloudflare API
  │     → daftarkan DNS record: orca-<id>.<domain>
  │     → jalankan cloudflared process
  │
  ├── Status di-poll via window.api.mobile.getCloudflareRelayStatus()
  └── Hostname aktif di-save ke settings.cloudflareRelayHostname
       → muncul di Mobile page sebagai "This computer's address"
```

### Connection mode di orca-old

`MobilePairingConnectionMode = 'automatic' | 'local-only'`

Di orca-old, Cloudflare **tidak ditambahkan sebagai mode baru** — tunnelnya
diaktifkan terpisah di Settings, dan hostname-nya muncul sebagai custom address
pilihan di Mobile page. User masih pilih LAN mode lalu pilih tunnel hostname
sebagai address.

---

## Strategi Port untuk orca-clean

Kita bisa pilih dua approach:

### Approach A — Ikuti pola orca-old (recommended)

Cloudflare tunnel diaktifkan di Settings → Mobile, hostname muncul sebagai
"custom address" di Mobile page QR flow. Tidak perlu ubah `MobilePairingConnectionMode`.

**Touch points**:

1. `src/custom-modules/cloudflare/` — copy semua dari orca-old
2. `src/shared/global-settings-types.ts` — tambah 4 fields cloudflare
3. `src/shared/cloudflare-relay-status.ts` — file baru (copy dari custom-modules)
4. `src/main/ipc/mobile.ts` — tambah 3 IPC handler calls
5. `src/preload/api/mobile-api.ts` — expose 3 methods ke renderer
6. `src/renderer/src/components/settings/MobilePairingSetupSection.tsx` — inject `<CloudflareRelaySection>`

### Approach B — Mode ketiga `'cloudflare'`

Tambah `'cloudflare'` ke `MobilePairingConnectionMode` union dan tampilkan
sebagai opsi radio ketiga di `MobilePairingConnectionOptions`.

**Lebih banyak touch points, lebih invasif ke upstream.**

**→ Kita pakai Approach A.**

---

## Files yang Perlu Dibuat / Diubah

### 1. Copy `src/custom-modules/cloudflare/` dari orca-old

```
src/custom-modules/cloudflare/
├── CloudflareRelaySection.tsx       ← Settings UI: token + domain form + connect button
├── CloudflareRelayStatusSegment.tsx ← Status bar widget (opsional, pakai dulu)
├── shared/
│   └── cloudflare-relay-status.ts  ← Type: CloudflareRelayStatusPayload
└── main/
    ├── cloudflare-relay-ipc.ts      ← initCloudflareRelayIpc() — IPC handlers
    ├── persistence/
    │   └── index.ts                 ← Re-export Store type
    └── runtime/cloudflare-relay/
        ├── cloudflare-relay.ts      ← CloudflareRelayService (manage cloudflared process)
        └── cloudflare-relay-provision.ts ← Download + verify cloudflared binary
```

### 2. `src/shared/global-settings-types.ts` — tambah 4 fields

```typescript
// Tambahkan ke GlobalSettings interface:
cloudflareRelayToken?: string       // Cloudflare API token
cloudflareRelayDomain?: string      // Domain di Cloudflare (e.g. example.com)
cloudflareRelayEnabled?: boolean    // Apakah tunnel aktif
cloudflareRelayHostname?: string    // Hostname aktif: orca-<id>.example.com
```

### 3. `src/shared/cloudflare-relay-status.ts` — file baru

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

### 4. `src/main/ipc/mobile.ts` — tambah handler calls

```typescript
// Tambahkan di dalam registerMobileHandlers() atau setelah:
import { initCloudflareRelayIpc } from '../../custom-modules/cloudflare/main/cloudflare-relay-ipc'
// ...setelah firstWindowStartupServicesReady:
initCloudflareRelayIpc()
```

### 5. `src/preload/api/mobile-api.ts` — expose ke renderer

```typescript
import type { CloudflareRelayStatusPayload } from '../../shared/cloudflare-relay-status'

// Tambah ke MobileApi type:
getCloudflareRelayStatus?: () => Promise<CloudflareRelayStatusPayload>
restartCloudflareRelay?: () => Promise<{ ok: boolean; error?: string }>
setCloudflareRelay?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
```

### 6. `src/renderer/src/components/settings/MobilePairingSetupSection.tsx` — inject UI

```typescript
import { CloudflareRelaySection } from '../../../../../custom-modules/cloudflare/CloudflareRelaySection'

// Tambah di dalam return, setelah MobilePairingConnectionOptions:
<CloudflareRelaySection />
```

---

## inject-custom-modules.sh — tambah 4 injection points baru

Setelah port, tambah ke script:

```bash
# 3. global-settings-types.ts — cloudflare fields
# 4. mobile.ts — initCloudflareRelayIpc()
# 5. mobile-api.ts — expose methods
# 6. MobilePairingSetupSection.tsx — CloudflareRelaySection render
```

---

## Catatan Penting

### cloudflared binary

`CloudflareRelayService` perlu binary `cloudflared`. Di orca-old, `cloudflare-relay-provision.ts`
mendownload binary dari GitHub releases. Perlu cek:

- Path download: `~/.config/orca/cloudflared` atau `ORCA_CLOUDFLARED_PATH` env
- Platform: linux-amd64, darwin-amd64, darwin-arm64, windows-amd64.exe

### IPC namespace conflict

Cloudflare IPC di orca-old pakai `mobile:` namespace (`mobile:getCloudflareRelayStatus`,
`mobile:restartCloudflareRelay`, `mobile:setCloudflareRelay`) karena ini terkait mobile pairing.
Pastikan tidak konflik dengan existing `mobile:*` handlers di orca-clean.

### Settings schema

`global-settings-types.ts` adalah file shared upstream. Penambahan fields bersifat additive
(optional fields), jadi safe — tidak breaking existing settings.

### Status bar segment (opsional)

`CloudflareRelayStatusSegment.tsx` bisa di-inject ke status bar untuk monitoring quick.
Di orca-old belum di-wire ke status bar upstream. Port dulu core functionality,
status bar bisa menyusul.

---

## Upstream files disentuh (6 total)

| File                                                                 | Perubahan                                     |
| -------------------------------------------------------------------- | --------------------------------------------- |
| `src/shared/global-settings-types.ts`                                | +4 optional fields                            |
| `src/shared/cloudflare-relay-status.ts`                              | File baru (kita buat di shared/)              |
| `src/main/ipc/mobile.ts`                                             | +1 import + 1 function call                   |
| `src/preload/api/mobile-api.ts`                                      | +3 optional method types                      |
| `src/renderer/src/components/settings/MobilePairingSetupSection.tsx` | +1 import + 1 render                          |
| `src/renderer/src/assets/main.css`                                   | (opsional, jika cloudflare punya CSS sendiri) |

Semua additive, tidak ada destructive edit.
