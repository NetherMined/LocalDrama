import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type Language, type PathValidation, type ProxyTest } from '../api'
import { useStatus } from '../status'
import { errorMessage } from '../lib/format'
import { ErrorPanel, Spinner, buttonClass } from '../components/ui'
import { LanUrlRow } from '../components/LanUrlRow'
import { ProxyField } from '../components/ProxyField'

const STEPS = ['Download location', 'Language', 'Connection', 'Advanced', 'Network'] as const
const QUALITIES = [720, 540, 360] as const

export function Setup() {
  const navigate = useNavigate()
  const { status, reload } = useStatus()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [languages, setLanguages] = useState<Language[]>([])

  const [root, setRoot] = useState('')
  const [checking, setChecking] = useState(false)
  const [validation, setValidation] = useState<{ path: string; result: PathValidation } | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)

  const [language, setLanguage] = useState('en')

  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyResult, setProxyResult] = useState<ProxyTest | null>(null)

  const [delay, setDelay] = useState(1500)
  const [concurrency, setConcurrency] = useState(1)
  const [quality, setQuality] = useState<number>(720)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    api
      .setupDefaults()
      .then((defaults) => {
        if (cancelled) return
        setRoot(defaults.suggestedRoot)
        setLanguages(defaults.languages)
        if (defaults.languages.length && !defaults.languages.some((l) => l.code === 'en')) {
          setLanguage(defaults.languages[0].code)
        }
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const trimmed = root.trim()
  const rootValid = validation !== null && validation.path === trimmed && validation.result.ok

  async function check() {
    setCheckError(null)
    setChecking(true)
    try {
      const result = await api.validatePath(trimmed)
      setValidation({ path: trimmed, result })
    } catch (err) {
      setValidation(null)
      setCheckError(errorMessage(err))
    } finally {
      setChecking(false)
    }
  }

  const trimmedProxy = proxyUrl.trim()

  async function finish() {
    if (!validation?.result.ok) return
    setSaving(true)
    setSaveError(null)
    try {
      await api.completeSetup({
        downloadRoot: validation.result.resolved,
        language,
        proxyUrl: trimmedProxy,
        requestDelay: Math.max(0, Math.round(delay) || 0),
        concurrency,
        quality,
      })
      await reload()
      navigate('/', { replace: true })
    } catch (err) {
      setSaveError(errorMessage(err))
      setSaving(false)
    }
  }

  if (loading) return <Spinner label="Loading setup" />

  if (loadError) {
    return (
      <ErrorPanel
        title="Setup could not load"
        message={loadError}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    )
  }

  const lanUrls = status?.lanUrls ?? []
  const lastStep = STEPS.length - 1

  return (
    <div>
      <header className="mb-8">
        <p className="text-sm font-semibold tracking-widest text-accent-text uppercase">Welcome to Dramabox</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Let's set things up</h1>
        {status?.mock && (
          <p className="mt-2 text-sm text-amber-300">Running in mock mode: downloads use sample data.</p>
        )}
      </header>

      <ol className="mb-8 flex flex-wrap gap-2" aria-label="Setup steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? 'step' : undefined}
            className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              i === step
                ? 'bg-accent text-white'
                : i < step
                  ? 'bg-panel-2 text-white/80'
                  : 'border border-line text-muted'
            }`}
          >
            <span aria-hidden="true">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className="rounded-xl border border-line bg-panel p-5 sm:p-8">
        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold">Where should episodes be saved?</h2>
            <p className="mt-1 text-sm text-muted">
              Files are stored as <span className="font-mono text-white/80">Show Name/Show Name - E01 - Title.mp4</span> inside this folder.
            </p>
            <label htmlFor="root" className="mt-6 block text-sm font-medium">
              Download folder
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                id="root"
                type="text"
                value={root}
                onChange={(e) => setRoot(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm outline-none focus:border-accent-hi"
              />
              <button
                type="button"
                onClick={() => void check()}
                disabled={!trimmed || checking}
                className={buttonClass('ghost')}
              >
                {checking ? 'Checking...' : 'Check'}
              </button>
            </div>
            {checkError && (
              <p role="alert" className="mt-3 text-sm text-red-300">
                {checkError}
              </p>
            )}
            {validation && validation.path === trimmed && (
              <div
                role="status"
                className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                  validation.result.ok
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                    : 'border-red-500/40 bg-red-500/10 text-red-200'
                }`}
              >
                {validation.result.ok ? (
                  <>
                    Folder is writable. Resolved to <span className="font-mono break-all">{validation.result.resolved}</span>
                  </>
                ) : (
                  validation.result.error ?? 'This folder cannot be used.'
                )}
              </div>
            )}
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold">Preferred language</h2>
            <p className="mt-1 text-sm text-muted">Used for show titles, tags and episode names from the catalogue.</p>
            <label htmlFor="language" className="mt-6 block text-sm font-medium">
              Language
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-2 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent-hi sm:w-72"
            >
              {languages.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </option>
              ))}
            </select>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold">Connection to Dramabox</h2>
            <p className="mt-1 text-sm text-muted">
              Dramabox often blocks South African and other restricted-region IP addresses. A proxy located in Europe,
              the US or Asia is recommended. The proxy is optional.
            </p>
            <label htmlFor="proxy" className="mt-6 block text-sm font-medium">
              Proxy URL <span className="font-normal text-muted">(optional)</span>
            </label>
            <ProxyField id="proxy" value={proxyUrl} onChange={setProxyUrl} onResult={setProxyResult} />
            <p className="mt-2 text-xs text-muted">Leave empty and test to check direct access without a proxy.</p>

            {(!trimmedProxy || proxyResult?.country === 'ZA') && (
              <p className="mt-4 rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-100">
                {trimmedProxy
                  ? 'This connection appears to be in South Africa, so the Dramabox API will likely be blocked. Use a proxy outside ZA.'
                  : 'No proxy is set. The Dramabox API will likely be blocked from a South African connection. You can continue and configure a proxy later.'}
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold">Advanced <span className="text-sm font-normal text-muted">(optional)</span></h2>
            <p className="mt-1 text-sm text-muted">Defaults are safe. Slower delays reduce the chance of being rate-limited.</p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="delay" className="block text-sm font-medium">
                  Request delay (ms)
                </label>
                <input
                  id="delay"
                  type="number"
                  min={0}
                  step={100}
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                  className="mt-2 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent-hi"
                />
                <p className="mt-1 text-xs text-muted">Pause between upstream requests. Default 1500.</p>
              </div>
              <div>
                <label htmlFor="concurrency" className="block text-sm font-medium">
                  Concurrent downloads
                </label>
                <select
                  id="concurrency"
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="mt-2 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent-hi"
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="quality" className="block text-sm font-medium">
                  Preferred quality
                </label>
                <select
                  id="quality"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="mt-2 w-full rounded-md border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-accent-hi"
                >
                  {QUALITIES.map((q) => (
                    <option key={q} value={q}>
                      {q}p{q === 720 ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {step === lastStep && (
          <div>
            <h2 className="text-xl font-semibold">Open it from other devices</h2>
            <p className="mt-1 text-sm text-muted">
              Phones, tablets and TVs on the same Wi-Fi can use these addresses to reach Dramabox.
            </p>
            {lanUrls.length > 0 ? (
              <ul className="mt-5 space-y-2">
                {lanUrls.map((url) => (
                  <LanUrlRow key={url} url={url} />
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-md border border-line px-3 py-2 text-sm text-muted">
                No LAN address was detected. Use this computer's IP address with port 8096.
              </p>
            )}
            <p className="mt-5 rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-sm text-amber-100">
              If other devices cannot connect, allow inbound TCP port <strong>8096</strong> through the Windows Firewall
              and your router.
            </p>
          </div>
        )}

        {saveError && (
          <p role="alert" className="mt-6 text-sm text-red-300">
            {saveError}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
            className={buttonClass('ghost')}
          >
            Back
          </button>
          {step < lastStep ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={step === 0 && !rootValid}
              className={buttonClass()}
            >
              Next
            </button>
          ) : (
            <button type="button" onClick={() => void finish()} disabled={saving || !rootValid} className={buttonClass()}>
              {saving ? 'Saving...' : 'Finish setup'}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
