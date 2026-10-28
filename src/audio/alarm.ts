let unlocked = false
let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
  }
  return ctx
}

/** Call from a user gesture (join / enable sound) so later alarms can autoplay. */
export async function unlockAudio(): Promise<void> {
  const audio = getCtx()
  if (audio.state === 'suspended') {
    await audio.resume()
  }
  // Tiny silent blip to fully unlock on iOS
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  gain.gain.value = 0.0001
  osc.connect(gain)
  gain.connect(audio.destination)
  osc.start()
  osc.stop(audio.currentTime + 0.01)
  unlocked = true
}

export function isAudioUnlocked(): boolean {
  return unlocked
}

/** Loud multi-beep alarm — same pattern on every device. */
export async function playAlarm(): Promise<void> {
  try {
    const audio = getCtx()
    if (audio.state === 'suspended') {
      await audio.resume()
    }
    const now = audio.currentTime
    const pattern = [0, 0.18, 0.36, 0.54, 0.8, 0.98]
    for (const t of pattern) {
      const osc = audio.createOscillator()
      const gain = audio.createGain()
      osc.type = 'square'
      osc.frequency.value = t < 0.7 ? 880 : 660
      gain.gain.setValueAtTime(0.0001, now + t)
      gain.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.14)
      osc.connect(gain)
      gain.connect(audio.destination)
      osc.start(now + t)
      osc.stop(now + t + 0.16)
    }
  } catch {
    // Ignore audio failures (autoplay still blocked, etc.)
  }
}
