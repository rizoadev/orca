// AudioWorklet: mic -> PCM16 mono 16 kHz -> base64 chunks, with an energy VAD
// that gates speech and signals end-of-utterance. Ported from the proven
// gemini-live harness. Why these specifics matter:
//  1) Browsers feed 44.1/48 kHz; Gemini needs true 16 kHz, so we LINEARLY
//     RESAMPLE (relabeling alone made speech fast/garbled).
//  2) HIT=0.0035 is tuned low so laptop/headset mics actually cross threshold
//     (a higher gate left the VU moving but never emitted audio).
//  3) END_SILENCE=900ms of sub-threshold audio after speech => streamEnd, which
//     the app uses to finalize + dispatch the utterance (hands-free, no PTT).

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function bytesToBase64(bytes) {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}==`
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += `${B64[(n >> 18) & 63]}${B64[(n >> 12) & 63]}${B64[(n >> 6) & 63]}=`
  }
  return out
}

class MicProc extends AudioWorkletProcessor {
  constructor() {
    super()
    this.inRate = sampleRate
    this.ratio = this.inRate / 16000
    this.inBuf = []
    this.inPos = 0
    this.outBuf = []
    this.levelSum = 0
    this.levelCount = 0
    this.spokeRecently = false
    this.silenceMs = 0
    this.HIT = 0.0035
    this.END_SILENCE = 900
    this.FRAME_SAMPLES = 8000 // 500 ms @ 16 kHz
    this.frames = 0
    this.port.postMessage({ kind: 'workletReady', inputRate: this.inRate, outputRate: 16000 })
  }

  emitFrame() {
    const levelAvg = this.levelCount ? this.levelSum / this.levelCount : 0
    const out = new Int16Array(this.outBuf)
    const u8 = new Uint8Array(out.buffer)
    this.frames++
    this.port.postMessage({ kind: 'vumeter', level: levelAvg, inputRate: this.inRate })
    if (levelAvg > this.HIT) {
      this.port.postMessage({ kind: 'audio', data: bytesToBase64(u8), level: levelAvg })
      this.spokeRecently = true
      this.silenceMs = 0
    } else {
      this.silenceMs += 500
      if (this.spokeRecently && this.silenceMs >= this.END_SILENCE) {
        this.port.postMessage({ kind: 'streamEnd' })
        this.spokeRecently = false
        this.silenceMs = 0
      }
    }
    this.outBuf = []
    this.levelSum = 0
    this.levelCount = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input.length || !input[0]) {
      return true
    }
    const ch = input[0]
    for (let i = 0; i < ch.length; i++) {
      this.inBuf.push(Math.max(-1, Math.min(1, ch[i])))
    }
    while (this.inBuf.length - 1 >= this.inPos) {
      const at = Math.floor(this.inPos)
      const frac = this.inPos - at
      const s = this.inBuf[at] * (1 - frac) + this.inBuf[at + 1] * frac
      const clamped = Math.max(-1, Math.min(1, s))
      this.outBuf.push(clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff))
      this.levelSum += Math.abs(clamped)
      this.levelCount++
      this.inPos += this.ratio
      if (this.outBuf.length >= this.FRAME_SAMPLES) {
        this.emitFrame()
      }
    }
    const drop = Math.max(0, Math.floor(this.inPos))
    if (drop > 0) {
      this.inBuf.splice(0, drop)
      this.inPos -= drop
    }
    return true
  }
}

registerProcessor('orca-mic-proc', MicProc)
