import { unlockAudio, isAudioUnlocked } from './alarm'
import { getNeighborhoodMuted } from '../lib/neighborhoodMute'
import type { NbCinematic } from '../core/neighborhood/cinematics'

let ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

async function ensureCtx(): Promise<AudioContext | null> {
  if (getNeighborhoodMuted()) return null
  if (!isAudioUnlocked()) {
    try {
      await unlockAudio()
    } catch {
      return null
    }
  }
  const audio = getCtx()
  if (audio.state === 'suspended') {
    try {
      await audio.resume()
    } catch {
      return null
    }
  }
  return audio
}

function blip(
  audio: AudioContext,
  freq: number,
  start: number,
  dur: number,
  gain = 0.08,
  type: OscillatorType = 'square',
) {
  const osc = audio.createOscillator()
  const g = audio.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(gain, start)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(audio.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

/** Cue matching a cinematic kind. */
export async function playNeighborhoodCue(kind: NbCinematic['kind']): Promise<void> {
  const audio = await ensureCtx()
  if (!audio) return
  const t = audio.currentTime
  switch (kind) {
    case 'dice':
      blip(audio, 420, t, 0.06, 0.07)
      blip(audio, 520, t + 0.08, 0.06, 0.07)
      blip(audio, 640, t + 0.16, 0.08, 0.09)
      break
    case 'step':
      blip(audio, 280, t, 0.05, 0.05, 'triangle')
      break
    case 'pay':
    case 'pay-each':
      blip(audio, 360, t, 0.1, 0.07)
      blip(audio, 240, t + 0.1, 0.14, 0.06)
      if (kind === 'pay-each') {
        blip(audio, 300, t + 0.22, 0.1, 0.05)
        blip(audio, 220, t + 0.34, 0.12, 0.05)
      }
      break
    case 'collect':
    case 'collect-each':
      blip(audio, 480, t, 0.08, 0.07)
      blip(audio, 640, t + 0.09, 0.1, 0.08)
      blip(audio, 800, t + 0.2, 0.12, 0.07)
      break
    case 'buy':
      blip(audio, 520, t, 0.12, 0.08, 'sine')
      blip(audio, 780, t + 0.12, 0.15, 0.07, 'sine')
      break
    case 'card':
      blip(audio, 300, t, 0.15, 0.06, 'sawtooth')
      blip(audio, 450, t + 0.12, 0.18, 0.05, 'sawtooth')
      break
    case 'jail':
      blip(audio, 180, t, 0.2, 0.09)
      blip(audio, 140, t + 0.18, 0.25, 0.08)
      break
    case 'trade':
      blip(audio, 400, t, 0.1, 0.06)
      blip(audio, 500, t + 0.12, 0.1, 0.06)
      blip(audio, 600, t + 0.24, 0.12, 0.07)
      break
    case 'toast':
      blip(audio, 500, t, 0.06, 0.04, 'sine')
      break
  }
}

export { unlockAudio }
