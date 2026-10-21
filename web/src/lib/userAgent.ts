export interface AgentSummary {
  browser: string
  os: string
}

export function parseUserAgent(ua: string): AgentSummary {
  let browser = 'Other'
  if (/SamsungBrowser\//.test(ua)) browser = 'Samsung'
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge'
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = 'Other'
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Tizen/.test(ua)) os = 'Tizen'
  else if (/Web0S|webOS/i.test(ua)) os = 'webOS'
  else if (/Linux/.test(ua)) os = 'Linux'
  return { browser, os }
}

/** iPadOS in desktop mode reports a Macintosh user agent but still has touch points. */
export function isIpadDesktop(): boolean {
  if (typeof navigator === 'undefined') return false
  return navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent)
}
