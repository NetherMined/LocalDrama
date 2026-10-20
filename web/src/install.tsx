import { useEffect, useState } from 'react'

export type Platform = 'ios' | 'android' | 'desktop' | 'tv'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type PromptOutcome = 'accepted' | 'dismissed' | 'unavailable'

const TV_PATTERN = /SmartTV|Tizen|Web0S|webOS|GoogleTV|AndroidTV|BRAVIA|AFT|CrKey/i
const STANDALONE_QUERY = '(display-mode: standalone)'

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

export function detectPlatform(
  userAgent: string = navigator.userAgent,
  touchPoints: number = navigator.maxTouchPoints,
): Platform {
  if (TV_PATTERN.test(userAgent)) return 'tv'
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'desktop'
}

export function isInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = window.matchMedia?.(STANDALONE_QUERY).matches ?? false
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standalone || iosStandalone
}

export interface InstallState {
  canPrompt: boolean
  prompt: () => Promise<PromptOutcome>
  installed: boolean
  platform: Platform
}

export function useInstall(): InstallState {
  const [, setTick] = useState(0)
  const [installed, setInstalled] = useState(isInstalled)

  useEffect(() => {
    const onChange = () => setTick((tick) => tick + 1)
    const onDisplayMode = () => setInstalled(isInstalled())
    const media = window.matchMedia?.(STANDALONE_QUERY)
    listeners.add(onChange)
    media?.addEventListener('change', onDisplayMode)
    window.addEventListener('appinstalled', onDisplayMode)
    return () => {
      listeners.delete(onChange)
      media?.removeEventListener('change', onDisplayMode)
      window.removeEventListener('appinstalled', onDisplayMode)
    }
  }, [])

  async function prompt(): Promise<PromptOutcome> {
    const event = deferredPrompt
    if (!event) return 'unavailable'
    await event.prompt()
    const choice = await event.userChoice
    deferredPrompt = null
    notify()
    return choice.outcome
  }

  return {
    canPrompt: deferredPrompt !== null,
    prompt,
    installed,
    platform: detectPlatform(),
  }
}
