import { useEffect, useState, type ReactNode } from 'react'
import QRCode from 'qrcode'
import { useInstall } from '../install'
import { useStatus } from '../status'
import { buttonClass } from './ui'
import { Modal } from './Modal'
import { AddSquareIcon, ShareIcon } from './icons'

function Steps({ children }: { children: ReactNode }) {
  return <ol className="space-y-3 text-sm text-white/85">{children}</ol>
}

function Step({ n, icon, children }: { n: number; icon?: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
        {n}
      </span>
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {icon && <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-white">{icon}</span>}
        <span>{children}</span>
      </span>
    </li>
  )
}

export function InstallDialog({ onClose }: { onClose: () => void }) {
  const { canPrompt, prompt, installed, platform } = useInstall()
  const [qr, setQr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const { status } = useStatus()
  // A QR of localhost is useless on another device, so prefer the configured address.
  const isLocalhost = /^(localhost|127\.|\[?::1\]?$)/.test(window.location.hostname)
  const url = `${status?.publicUrl || window.location.origin}/`
  const unreachable = isLocalhost && !status?.publicUrl

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#000000', light: '#ffffff' } })
      .then((data) => {
        if (!cancelled) setQr(data)
      })
      .catch(() => {
        if (!cancelled) setQr(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  async function install() {
    setBusy(true)
    setMessage(null)
    const outcome = await prompt()
    setBusy(false)
    if (outcome === 'accepted') onClose()
    else if (outcome === 'dismissed') setMessage('Install was cancelled. You can try again any time.')
  }

  return (
    <Modal
      title="Install Dramora"
      description={installed ? 'Dramora is already installed on this device.' : undefined}
      onClose={onClose}
    >
      <div className="space-y-5">
        {!installed && platform === 'android' && (
          <div className="space-y-3">
            <p className="text-sm text-white/85">
              Download the Dramora app for this phone. It opens your server full screen, without the browser bar.
            </p>
            <a href="/dramora.apk" download="Dramora.apk" className={`${buttonClass()} w-full`}>
              Install
            </a>
            <Steps>
              <Step n={1}>Tap <strong>Install</strong>. Android downloads Dramora.apk.</Step>
              <Step n={2}>Open the download and tap <strong>Install</strong>.</Step>
              <Step n={3}>
                If Android asks, allow installs from this browser. Then enter this server's address if it is not filled in.
              </Step>
            </Steps>
          </div>
        )}

        {!installed && platform !== 'android' && canPrompt && (
          <div className="space-y-3">
            <p className="text-sm text-white/85">
              Install DramaUs to your device for a full-screen app with its own icon. It opens without the browser
              bar and keeps the shell available offline.
            </p>
            <button type="button" onClick={() => void install()} disabled={busy} className={`${buttonClass()} w-full`}>
              {busy ? 'Opening…' : 'Install'}
            </button>
            {message && <p className="text-xs text-muted">{message}</p>}
          </div>
        )}

        {!installed && platform === 'ios' && !canPrompt && (
          <div className="space-y-3">
            <p className="text-sm text-white/85">Add DramaUs to your home screen from Safari:</p>
            <Steps>
              <Step n={1} icon={<ShareIcon />}>
                Tap <strong>Share</strong> at the bottom of the screen.
              </Step>
              <Step n={2} icon={<AddSquareIcon />}>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </Step>
              <Step n={3}>
                Tap <strong>Add</strong> in the top right.
              </Step>
            </Steps>
          </div>
        )}

        {!installed && platform === 'desktop' && !canPrompt && (
          <p className="text-sm text-white/85">
            Use the install icon in your browser's address bar, or open the address below on your phone and add it to
            the home screen.
          </p>
        )}

        {platform === 'tv' ? (
          <div className="space-y-3">
            <p className="text-sm text-white/85">
              Smart TVs can't install web apps. Open this address in your TV's browser and bookmark it.
            </p>
            <p className="break-all rounded-md bg-panel-2 p-4 text-center text-2xl font-extrabold tracking-tight text-white">
              {url}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col items-center gap-3 border-t border-line pt-5">
          <p className="text-sm font-semibold text-white">Open on another device</p>
          {unreachable ? (
            <p className="max-w-xs text-center text-sm text-muted">
              You opened DramaUs as <span className="text-white">localhost</span>, which other devices can't reach. Open
              it using this computer's network address instead, or ask your admin to set PUBLIC_URL.
            </p>
          ) : qr ? (
            <div className="rounded-2xl bg-white p-3 shadow-lg">
              <img src={qr} alt={`QR code for ${url}`} width={220} height={220} className="block h-[220px] w-[220px]" />
            </div>
          ) : (
            <p className="text-xs text-muted">QR code unavailable.</p>
          )}
          {!unreachable && <p className="break-all text-center text-sm text-muted">{url}</p>}
        </div>
      </div>
    </Modal>
  )
}
