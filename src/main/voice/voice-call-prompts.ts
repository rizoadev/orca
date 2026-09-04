/**
 * Gemini Live prompt templates for the voice-call coding flow. Kept separate
 * from the session orchestrator so the turn logic stays focused on wiring.
 */

// Why: a fixed instruction yields a canned-sounding acknowledgement. Feeding
// the real task + asking for variety lets Gemini Live produce a natural, varied
// ack each time instead of the same "Baik, aku akan cek…" every turn.
export function ackPrompt(task: string): string {
  return (
    '[CODING_ACK] User baru saja menugaskan coding task ini: ' +
    `"${task.slice(0, 400)}".\n` +
    'Ucapkan acknowledgement singkat (1 kalimat, Bahasa Indonesia lisan) bahwa kamu ' +
    'akan langsung mengerjakannya. Variasikan gaya bahasamu setiap kali — natural, ' +
    'hangat, jangan kaku, dan jangan mengulang kalimat yang sama persis dengan ' +
    'sebelumnya. Boleh singgung sekilas apa yang akan kamu kerjakan. Jangan mengklaim ' +
    'sudah selesai dan jangan menyebut tool internal.'
  )
}

export function reportPrompt(task: string, report: string): string {
  return (
    '[PI_CODING_REPORT]\n' +
    `Task user: ${task}\n` +
    `Report Pi SDK: ${report.slice(0, 14000)}\n` +
    'Laporkan hasilnya dalam Bahasa Indonesia secara singkat berdasarkan report ini.'
  )
}
