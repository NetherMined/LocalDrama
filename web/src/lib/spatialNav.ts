type Direction = 'left' | 'right' | 'up' | 'down'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const STARTED = '__dramoraSpatial'

function directionOf(key: string): Direction | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    default:
      return null
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag !== 'INPUT') return false
  const type = (target as HTMLInputElement).type
  return type !== 'button' && type !== 'checkbox' && type !== 'radio' && type !== 'submit' && type !== 'reset'
}

function isShown(el: HTMLElement): boolean {
  if (el.closest('[hidden]')) return false
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    if (Number(style.opacity) === 0) return false
  }
  const rect = el.getBoundingClientRect()
  return rect.width >= 2 && rect.height >= 2
}

function isCandidate(el: HTMLElement): boolean {
  if (el.getAttribute('tabindex') === '-1') return false
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false
  if (el.closest('[inert], [aria-hidden="true"]')) return false
  return isShown(el)
}

function searchRoot(): ParentNode {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter(isShown)
  return dialogs.length > 0 ? dialogs[dialogs.length - 1] : document
}

function candidates(): HTMLElement[] {
  return Array.from(searchRoot().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isCandidate)
}

function originRect(): DOMRect {
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement && isCandidate(active)) {
    return active.getBoundingClientRect()
  }
  return new DOMRect(0, -1, window.innerWidth, 1)
}

function overlap(a1: number, a2: number, b1: number, b2: number): number {
  return Math.min(a2, b2) - Math.max(a1, b1)
}

function score(from: DOMRect, to: DOMRect, direction: Direction): number | null {
  const fromCx = from.left + from.width / 2
  const fromCy = from.top + from.height / 2
  const toCx = to.left + to.width / 2
  const toCy = to.top + to.height / 2
  const dx = toCx - fromCx
  const dy = toCy - fromCy
  let main = 0
  let cross = 0
  if (direction === 'left') {
    if (dx >= -1) return null
    main = -dx
    cross = Math.abs(dy)
  } else if (direction === 'right') {
    if (dx <= 1) return null
    main = dx
    cross = Math.abs(dy)
  } else if (direction === 'up') {
    if (dy >= -1) return null
    main = -dy
    cross = Math.abs(dx)
  } else if (dy <= 1) {
    return null
  } else {
    main = dy
    cross = Math.abs(dx)
  }
  const aligned =
    direction === 'left' || direction === 'right'
      ? overlap(from.top, from.bottom, to.top, to.bottom) > 0
      : overlap(from.left, from.right, to.left, to.right) > 0
  return main + (aligned ? 0 : cross * cross) + cross * 0.15
}

function nearest(direction: Direction): HTMLElement | null {
  const from = originRect()
  const active = document.activeElement
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of candidates()) {
    if (el === active) continue
    const next = score(from, el.getBoundingClientRect(), direction)
    if (next === null || next >= bestScore) continue
    best = el
    bestScore = next
  }
  return best
}

function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
  const direction = directionOf(event.key)
  if (!direction || isTypingTarget(event.target)) return
  const next = nearest(direction)
  if (!next) return
  event.preventDefault()
  next.focus({ preventScroll: true })
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

function focusHeroPlay() {
  let stopped = false
  const stop = () => {
    stopped = true
    window.clearInterval(timer)
  }
  const attempt = () => {
    if (stopped) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement) {
      stop()
      return
    }
    const target = document.querySelector<HTMLElement>('[data-spatial-initial]')
    if (!target || !isCandidate(target)) return
    target.focus({ preventScroll: true })
    if (document.activeElement === target) stop()
  }
  const timer = window.setInterval(attempt, 250)
  window.addEventListener('keydown', stop, { capture: true, once: true })
  window.setTimeout(stop, 15000)
  attempt()
}

export function startSpatialNav() {
  const marker = window as Window & { [STARTED]?: boolean }
  if (marker[STARTED]) return
  marker[STARTED] = true
  // Bubble, so a handler that already called preventDefault (player seek, profiles, search) wins.
  document.addEventListener('keydown', onKey)
  focusHeroPlay()
}
