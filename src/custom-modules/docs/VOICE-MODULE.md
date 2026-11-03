# Voice Module — Google Gemini Live Standby → Pi CLI

## Ringkasan

Modul **Voice** (`src/custom-modules/voice/`) menambahkan fitur hands-free Google Voice Standby menggunakan **Google Gemini Live (BidiGenerateContent WebSocket API)** di panel Right Sidebar.

Begitu mode standby dinyalakan, Gemini Live mendengarkan suara pengguna melalui mikrofon secara terus-menerus (menggunakan `AudioWorklet` ber-resampling 16kHz PCM dengan energy VAD). Begitu pengguna selesai bicara (terdeteksi jeda/silence), hasil ucapan **langsung di-inject secara otomatis ke terminal Pi CLI aktif di main window** (`window.api.pty.writeAccepted(activePtyId, text + '\r', 'driving')`).

---

## Alur Kerja (Workflow)

```
[Pengguna Berbicara]
       │
       ▼ (16kHz PCM Audio Chunks)
[AudioWorklet: mic-worklet.mjs]
       │
       ▼ (BidiGenerateContent WebSocket)
[Gemini Live API]
       │
       ├─► outputAudioTranscription / Audio Output (Gemini merespon suara secara singkat)
       │
       └─► inputAudioTranscription (Transkripsi suara user secara real-time)
             │
             ▼ (Utterance Settle / Silence ~900ms)
       [Event: userUtteranceFinal]
             │
             ▼
       [VoiceCallPanel.tsx]
             │
             ▼ (Auto-send to Active Terminal)
       [window.api.pty.writeAccepted(activePtyId, text + '\r', 'driving')]
             │
             ▼
       [Terminal / Sesi Pi CLI di Main Window Menerima & Menjalankan Prompt!]
```

---

## Komponen & File

```
src/custom-modules/voice/
├── panel.tsx                              ← Entry point router untuk Right Sidebar
├── main/
│   ├── ipc/
│   │   └── voice-call.ts                  ← IPC handlers (registerVoiceCallHandlers)
│   └── voice/
│       ├── gemini-api-key-store.ts        ← Penyimpanan API key aman (safeStorage)
│       ├── gemini-live-client.ts          ← WebSocket client ke Gemini Live
│       └── voice-call-session.ts          ← State orchestrator sesi voice
├── renderer/src/
│   ├── voice/
│   │   └── mic-worklet.mjs                ← AudioWorklet 16kHz linear resampling + VAD
│   ├── hooks/
│   │   ├── use-voice-mic.ts               ← Hook mikrofon hands-free
│   │   └── use-audio-playback.ts          ← Web Audio gapless player untuk suara Gemini
│   └── components/right-sidebar/
│       └── VoiceCallPanel.tsx             ← UI panel: visualizer, toggle standby, auto-send Pi, transcript
└── shared/
    └── (types shared via src/shared/voice-call-types.ts)
```

---

## Upstream Touch Points (One-Line Injections)

Semua touch points dijaga agar minimal dan otomatis diinjeksi via `./src/custom-modules/inject-custom-modules.sh`:

1. **`src/shared/voice-call-types.ts`**: File tipe baru untuk kontrak event & API voice call.
2. **`src/preload/api-types.ts`**: +1 import + 1 field `voiceCall?: VoiceCallApi` di `PreloadApi`.
3. **`src/preload/index.ts`**: +1 import + 1 baris `voiceCall: voiceCallBridge` di `api`.
4. **`src/main/ipc/speech.ts`**: +1 baris `registerVoiceCallHandlers()` saat registrasi speech IPC.
5. **`src/custom-modules/custom-right-sidebar-tabs.ts`**: Tambahkan ID `'voice'` ke custom sidebar tabs.
6. **`src/custom-modules/custom-activity-items.ts`**: Tambahkan item `'voice'` dengan icon `Mic`.
7. **`src/custom-modules/custom-panel-content.tsx`**: Render lazy `<VoicePanel />` saat tab `'voice'` aktif.

---

## Cara Penggunaan

1. Buka Orca.
2. Pada Right Sidebar, klik icon **Mic** (Voice Call / Pi CLI).
3. Jika belum memasukkan Google Gemini API Key:
   - Klik icon Kunci di header panel, masukkan API key Gemini Anda, klik **Simpan**.
4. Pastikan opsi **"Auto-send ke Pi CLI di Main Window"** tercentang (default ON).
5. Buka tab terminal di main window tempat Anda menjalankan sesi `pi`.
6. Klik tombol **"Mulai Standby Voice"**.
7. Bicaralah seperti biasa (misal: _"tolong jelaskan arsitektur project ini"_).
8. Gemini mentranskrip ucapan Anda dan langsung mengetikkannya ke terminal aktif dengan tombol Enter (`\r`). Sesi Pi CLI Anda langsung memproses instruksi tersebut!

---

## Konfigurasi Model Live

Default model Live API: `gemini-3.8-live` (lihat `DEFAULT_MODEL` di `gemini-live-client.ts`). Model ini **voice agent**: Gemini membalas dengan audio singkat sesuai `systemInstruction`, sekaligus mengirim transkrip input untuk dikirim ke terminal.

Override tanpa ubah kode:

```bash
GEMINI_LIVE_MODEL=gemini-3.8-live              # voice agent: balas audio + system instruction
GEMINI_LIVE_MODEL=gemini-3.8-live-extended-thinking
GEMINI_LIVE_MODEL=gemini-3.5-transcribe-live   # khusus transkripsi, tanpa balasan audio
```

Model Live lain: `ai.google.dev/gemini-api/docs/models`. `gemini-live-client.ts` memilih bentuk `setup` otomatis berdasarkan nama model (transcribe vs conversational), jadi perbedaan `responseModalities`, `speechConfig`, dan `outputAudioTranscription` sudah ditangani.

Catatan untuk `gemini-3.8-live`: `thinkingLevel` tidak didukung — jangan ditambahkan ke setup. Model transcribe-only punya batas sesi 10 menit, model conversational tidak.

Jika Google menolak koneksi dengan kode `1008` dan menyebut model tidak ditemukan, model default sudah tidak aktif lagi — ganti lewat `GEMINI_LIVE_MODEL`.
