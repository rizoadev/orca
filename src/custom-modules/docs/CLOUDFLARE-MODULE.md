# Cloudflare Tunnel Module — Internals

## Apa Ini

Cloudflare Tunnel (`src/custom-modules/cloudflare/`) menambahkan **self-hosted persistent
tunnel** sebagai opsi koneksi di halaman Mobile Settings. Phone bisa connect ke desktop
dari mana saja tanpa Orca account — tunnel dikelola sendiri pakai Cloudflare API.

Setiap install Orca mendapat subdomain permanen: `orca-<machineId8>.<domain>`.
Tunnel tetap hidup bahkan saat Orca ditutup (via systemd user service di Linux).

---

## Cara Kerjanya

```
Settings → Mobile → CloudflareRelaySection
  │  User isi Cloudflare API token + domain, klik Connect
  │
  └→ window.api.mobile.setCloudflareRelay(true)
        │
        └→ [Main Process] registerCloudflareRelayHandlers()
              │
              └→ CloudflareRelayService.setEnabled(true)
                    │
                    ├→ CloudflareRelayProvisioner.provision()
                    │    ├─ Resolve zone ID dari Cloudflare API
                    │    ├─ Resolve account ID
                    │    ├─ Cari tunnel lama yang masih punya credentials
                    │    ├─ Buat tunnel baru jika tidak ada (POST /cfd_tunnel)
                    │    └─ Pastikan DNS CNAME: orca-<id>.<domain> → <tunnelId>.cfargotunnel.com
                    │
                    ├→ Tulis cloudflared config.yml (ingress rules, WS port)
                    │
                    ├→ Install systemd user service (Linux) atau jalankan child process
                    │
                    └→ updateSettings({ cloudflareRelayHostname: 'wss://orca-<id>.<domain>' })
                         └→ hostname ini muncul sebagai custom address di Mobile page QR flow
```

---

## Files

```
src/custom-modules/cloudflare/
├── CloudflareRelaySection.tsx       ← Settings UI: token + domain form + connect button
│                                     Inject ke MobilePane.tsx di bawah MobileAutoRestoreFitSection
├── CloudflareRelayStatusSegment.tsx ← Status bar widget (opsional, belum di-wire ke upstream)
├── shared/
│   └── cloudflare-relay-status.ts  ← CloudflareRelayStatusPayload type (lokal)
└── main/
    ├── cloudflare-relay-ipc.ts      ← registerCloudflareRelayHandlers()
    │                                  IPC: mobile:getCloudflareRelayStatus
    │                                       mobile:restartCloudflareRelay
    │                                       mobile:setCloudflareRelay
    ├── persistence/
    │   └── index.ts                 ← Re-export Store type dari upstream
    └── runtime/cloudflare-relay/
        ├── cloudflare-relay.ts      ← CloudflareRelayService
        │                              - start(wsPort): provision + run tunnel
        │                              - stop(): kill child / stop systemd
        │                              - restart(): stop + start
        │                              - setEnabled(bool): persist + toggle
        │                              - deleteTunnel(): hapus dari Cloudflare + DNS
        └── cloudflare-relay-provision.ts ← CloudflareRelayProvisioner
                                           - provision(): idempotent tunnel + DNS setup
                                           - deleteTunnel(): cleanup Cloudflare resources
```

**Shared type** (harus ada di upstream shared/ karena preload import dari sana):

```
src/shared/cloudflare-relay-status.ts   ← CloudflareRelayStatusPayload
                                           Dibuat oleh inject script jika belum ada
```

---

## Upstream Touch Points (7 total)

| #   | File                                                            | Perubahan                                  |
| --- | --------------------------------------------------------------- | ------------------------------------------ |
| 1   | `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx` | hero (sudah ada)                           |
| 2   | `src/renderer/src/assets/main.css`                              | hero CSS (sudah ada)                       |
| 3   | `src/shared/global-settings-types.ts`                           | +4 cloudflare optional fields              |
| 4   | `src/shared/cloudflare-relay-status.ts`                         | file baru (dibuat oleh inject script)      |
| 5   | `src/preload/api/mobile-api.ts`                                 | +1 import + 3 optional method types        |
| 6   | `src/main/ipc/mobile.ts`                                        | +1 import + 1 function call                |
| 7   | `src/renderer/src/components/settings/MobilePane.tsx`           | +1 import + 1 `<CloudflareRelaySection />` |

---

## Settings Fields

Ditambahkan ke `GlobalSettings` di `global-settings-types.ts`:

```typescript
cloudflareRelayToken?: string       // Cloudflare API token (Account-Tunnel:Edit, Zone-DNS:Edit)
cloudflareRelayDomain?: string      // Domain: e.g. example.com → tunnel jadi orca-<id>.example.com
cloudflareRelayEnabled?: boolean    // Apakah tunnel sedang aktif
cloudflareRelayHostname?: string    // Hostname aktif, ditulis setelah provisioning berhasil
                                    // Format: wss://orca-<machineId8>.<domain>
                                    // Auto-disimpan sebagai mobilePairingCustomAddress
```

---

## IPC Handlers

Semua di namespace `mobile:*` (shared dengan mobile pairing IPC):

| Channel                              | Arah            | Fungsi                                       |
| ------------------------------------ | --------------- | -------------------------------------------- |
| `mobile:getCloudflareRelayStatus`    | renderer → main | Poll status tunnel (state, hostname, wsPort) |
| `mobile:restartCloudflareRelay`      | renderer → main | Stop + start ulang tunnel                    |
| `mobile:setCloudflareRelay(enabled)` | renderer → main | Enable/disable tunnel, persist ke settings   |

---

## Preload Bridge

3 optional methods ditambahkan ke `MobileApi` type di `mobile-api.ts`:

```typescript
getCloudflareRelayStatus?: () => Promise<CloudflareRelayStatusPayload>
restartCloudflareRelay?: () => Promise<{ ok: boolean; error?: string }>
setCloudflareRelay?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>
```

Optional karena upstream tidak mengenalnya — renderer mengecek `?.` sebelum panggil.

---

## CloudflareRelayService — State Machine

```
disabled
  │  setEnabled(true) / start(wsPort)
  ↓
provisioning
  │  Cloudflare API calls berhasil + cloudflared binary ditemukan
  ↓
running  ←──────── restart() ──────────┐
  │  stop() / setEnabled(false)        │
  ↓                                    │
disabled                               │
  │  error dalam provisioning          │
  ↓                                    │
error ──────────────────────────────────
```

---

## Persistent State

Disimpan di `~/.config/orca/cloudflare-relay/`:

```
state.json          ← { machineId, tunnelName, tunnelId, hostname }
config.yml          ← cloudflared ingress config
<tunnelId>.json     ← tunnel credentials (chmod 600)
```

`machineId` dibuat sekali saat pertama kali provision. Persists selama userData hidup
sehingga subdomain `orca-<id>.<domain>` tetap sama meski Orca diinstall ulang.

---

## Tunnel Config (cloudflared)

```yaml
tunnel: <tunnelId>
credentials-file: ~/.config/orca/cloudflare-relay/<tunnelId>.json
protocol: http2 # Why: QUIC/UDP 7844 sering diblok ISP Asia
region: us # Why: Asia edge (cgk/sin) intermittent di beberapa ISP

ingress:
  - hostname: orca-<id>.<domain>
    path: (health|task-orchestration|api/webhooks)
    service: http://127.0.0.1:18789 # Orca HTTP port
  - hostname: orca-<id>.<domain>
    service: http://localhost:<wsPort> # Orca WebSocket (runtime RPC)
  - service: http_status:404
```

---

## Systemd Service (Linux)

Jika `systemctl --user` tersedia, tunnel diinstall sebagai user service:

```
~/.config/systemd/user/orca-cloudflare-tunnel.service
```

Ini berarti tunnel **tetap hidup setelah Orca ditutup**. Mobile phone bisa tetap
terhubung walaupun Orca tidak sedang berjalan.

Fallback: jika systemd tidak tersedia (container, WSL tanpa systemd), tunnel
dijalankan sebagai child process dalam Orca — mati saat Orca ditutup.

---

## Prasyarat User

1. **Cloudflare account** dengan domain yang sudah di-manage di Cloudflare DNS
2. **API token** dengan permissions: `Account → Cloudflare Tunnel: Edit`, `Zone → DNS: Edit`
3. **`cloudflared` binary** di PATH, atau set `ORCA_CLOUDFLARED_PATH` env var
   - Install: `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared`

---

## Flow Pairing setelah Tunnel Aktif

1. Tunnel running → `cloudflareRelayHostname = "wss://orca-<id>.example.com"` tersimpan
2. Di Mobile page → Network address picker → pilih tunnel hostname sebagai custom address
3. Generate QR → QR berisi tunnel URL
4. Scan dari Orca Mobile → connect via tunnel dari mana saja

---

## Idempotency

`CloudflareRelayProvisioner.provision()` idempotent:

- Jika tunnel dengan `machineId` sudah ada di Cloudflare **dan** credentials lokal ada → reuse
- Jika DNS CNAME sudah ada dan pointing ke tunnel yang benar → skip DNS update
- Hanya buat baru jika tunnel tidak ada atau credentials hilang
