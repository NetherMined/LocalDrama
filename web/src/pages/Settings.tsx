import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api, type Config, type Language, type PathValidation, type SettingsPatch } from '../api'
import { LanUrlRow } from '../components/LanUrlRow'
import { MediaServers } from '../components/MediaServers'
import { ProxyField } from '../components/ProxyField'
import { SystemHealth } from '../components/SystemHealth'
import { ErrorPanel, NoticeText, PageHeader, Section, Spinner, buttonClass, inputClass, type Notice } from '../components/ui'
import { errorMessage } from '../lib/format'
import { useStatus } from '../status'

const QUALITIES = [720, 540, 360] as const
const CONCURRENCY = [1, 2, 3, 4] as const

export function Settings() {
  const { status } = useStatus()
  if (!status?.profile?.isAdmin) return <Navigate to="/" replace />
  return <SettingsPage />
}

interface Form {
  downloadRoot: string
  language: string
  proxyUrl: string
  requestDelay: number
  concurrency: number
  quality: number
}

function toForm(cfg: Config): Form {
  return {
    downloadRoot: cfg.downloadRoot,
    language: cfg.language,
    proxyUrl: cfg.proxyUrl,
    requestDelay: cfg.requestDelay,
    concurrency: cfg.concurrency,
    quality: cfg.quality,
  }
}

function SettingsPage() {
  const { status, reload } = useStatus()
  const [config, setConfig] = useState<Config | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [languages, setLanguages] = useState<Language[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)

  const [checking, setChecking] = useState(false)
  const [rootCheck, setRootCheck] = useState<PathValidation | null>(null)

  const [pwEditing, setPwEditing] = useState(false)
  const [pw, setPw] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwNotice, setPwNotice] = useState<Notice | null>(null)

  const [scanning, setScanning] = useState(false)
  const [scanNotice, setScanNotice] = useState<Notice | null>(null)

  const [mdnsBusy, setMdnsBusy] = useState(false)
  const [mdnsNotice, setMdnsNotice] = useState<Notice | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([api.settings(), api.setupDefaults()])
      .then(([cfg, defaults]) => {
        if (cancelled) return
        setConfig(cfg)
        setForm(toForm(cfg))
        setLanguages(defaults.languages)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (loadError) {
    return (
      <>
        <PageHeader title="Settings" />
        <ErrorPanel title="Settings could not load" message={loadError} onRetry={() => setAttempt((n) => n + 1)} />
      </>
    )
  }

  if (!config || !form) {
    return (
      <>
        <PageHeader title="Settings" />
        <Spinner label="Loading settings" />
      </>
    )
  }

  const current = config
  const values = form
  const languageOptions = languages.some((l) => l.code === values.language)
    ? languages
    : [...languages, { code: values.language, label: values.language }]

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function checkRoot() {
    setChecking(true)
    setRootCheck(null)
    try {
      setRootCheck(await api.validatePath(values.downloadRoot.trim()))
    } catch (err) {
      setRootCheck({ ok: false, error: errorMessage(err), resolved: '' })
    } finally {
      setChecking(false)
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setNotice(null)
    try {
      const patch: SettingsPatch = {}
      const root = values.downloadRoot.trim()
      if (root !== current.downloadRoot) {
        const check = await api.validatePath(root)
        if (!check.ok) throw new Error(check.error ?? 'This folder cannot be used.')
        patch.downloadRoot = check.resolved
      }
      if (values.language !== current.language) patch.language = values.language
      const proxy = values.proxyUrl.trim()
      if (proxy !== current.proxyUrl.trim()) patch.proxyUrl = proxy
      if (values.requestDelay !== current.requestDelay) {
        patch.requestDelay = Math.max(0, Math.round(values.requestDelay) || 0)
      }
      if (values.concurrency !== current.concurrency) patch.concurrency = values.concurrency
      if (values.quality !== current.quality) patch.quality = values.quality

      if (Object.keys(patch).length === 0) {
        setNotice({ kind: 'ok', text: 'No changes to save.' })
        return
      }
      const updated = await api.updateSettings(patch)
      setConfig(updated)
      setForm(toForm(updated))
      setRootCheck(null)
      setNotice({ kind: 'ok', text: 'Settings saved.' })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(value: string, successText: string) {
    setPwBusy(true)
    setPwNotice(null)
    try {
      const updated = await api.updateSettings({ password: value })
      setConfig(updated)
      setPw('')
      setPwConfirm('')
      setPwEditing(false)
      setPwNotice({ kind: 'ok', text: successText })
      await reload()
    } catch (err) {
      setPwNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setPwBusy(false)
    }
  }

  function removePassword() {
    if (!window.confirm('Remove the admin password? Anyone who can reach this server will be able to use it.')) return
    void savePassword('', 'Password removed.')
  }

  async function toggleMdns(enabled: boolean) {
    setMdnsBusy(true)
    setMdnsNotice(null)
    try {
      const updated = await api.updateSettings({ mdns: enabled })
      setConfig(updated)
      setMdnsNotice({
        kind: 'ok',
        text: enabled ? 'Advertising on the network.' : 'Network advertising is off.',
      })
    } catch (err) {
      setMdnsNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setMdnsBusy(false)
    }
  }

  async function scan() {
    setScanning(true)
    setScanNotice(null)
    try {
      const res = await api.scanLibrary()
      setScanNotice({ kind: 'ok', text: `Scan complete: ${res.added} added, ${res.removed} removed.` })
    } catch (err) {
      setScanNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setScanning(false)
    }
  }

  const pwMismatch = pwConfirm !== '' && pw !== pwConfirm
  const pwValid = pw.length > 0 && pw === pwConfirm
  const lanUrls = status?.lanUrls ?? []

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <form onSubmit={(e) => void save(e)} className="space-y-6">
        <Section id="storage" title="Storage" description="Where downloaded episodes are saved.">
          <label htmlFor="download-root" className="block text-sm font-medium">
            Download folder
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="download-root"
              type="text"
              value={values.downloadRoot}
              onChange={(e) => {
                update('downloadRoot', e.target.value)
                setRootCheck(null)
              }}
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-md border border-line bg-ink px-3 py-2 font-mono text-sm outline-none focus:border-accent-hi"
            />
            <button
              type="button"
              onClick={() => void checkRoot()}
              disabled={!values.downloadRoot.trim() || checking}
              className={buttonClass('ghost')}
            >
              {checking ? 'Checking...' : 'Check'}
            </button>
          </div>
          {rootCheck && (
            <p
              role="status"
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                rootCheck.ok
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/40 bg-red-500/10 text-red-200'
              }`}
            >
              {rootCheck.ok ? (
                <>
                  Folder is writable. Resolved to <span className="font-mono break-all">{rootCheck.resolved}</span>
                </>
              ) : (
                rootCheck.error ?? 'This folder cannot be used.'
              )}
            </p>
          )}
        </Section>

        <Section id="language" title="Language" description="Used for show titles, tags and episode names from the catalogue.">
          <label htmlFor="language" className="block text-sm font-medium">
            Catalogue language
          </label>
          <select
            id="language"
            value={values.language}
            onChange={(e) => update('language', e.target.value)}
            className={`${inputClass} sm:w-72`}
          >
            {languageOptions.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label} ({l.code})
              </option>
            ))}
          </select>
        </Section>

        <Section
          id="connection"
          title="Connection"
          description="Dramabox often blocks restricted-region addresses. A proxy outside that region keeps the API reachable."
        >
          <label htmlFor="proxy" className="block text-sm font-medium">
            Proxy URL <span className="font-normal text-muted">(optional)</span>
          </label>
          <ProxyField
            id="proxy"
            value={values.proxyUrl}
            onChange={(v) => update('proxyUrl', v)}
          />
        </Section>

        <Section id="downloads" title="Downloads" description="Pacing and quality for new downloads.">
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="delay" className="block text-sm font-medium">
                Request delay (ms)
              </label>
              <input
                id="delay"
                type="number"
                min={0}
                step={100}
                value={values.requestDelay}
                onChange={(e) => update('requestDelay', Number(e.target.value))}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="concurrency" className="block text-sm font-medium">
                Concurrent downloads
              </label>
              <select
                id="concurrency"
                value={values.concurrency}
                onChange={(e) => update('concurrency', Number(e.target.value))}
                className={inputClass}
              >
                {CONCURRENCY.map((n) => (
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
                value={values.quality}
                onChange={(e) => update('quality', Number(e.target.value))}
                className={inputClass}
              >
                {QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q}p{q === 720 ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={saving} className={buttonClass()}>
            {saving ? 'Saving...' : 'Save settings'}
          </button>
          {notice && <NoticeText notice={notice} />}
        </div>
      </form>

      <Section id="security" title="Security" description="An admin password requires sign-in before the app or its media can be used.">
        {!pwEditing && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-sm text-muted">
              {current.hasPassword ? 'A password is set.' : 'No password is set. Anyone who can reach this server has access.'}
            </p>
            <button type="button" onClick={() => setPwEditing(true)} className={buttonClass('ghost')}>
              {current.hasPassword ? 'Change password' : 'Set password'}
            </button>
            {current.hasPassword && (
              <button type="button" onClick={removePassword} disabled={pwBusy} className={buttonClass('danger')}>
                Remove password
              </button>
            )}
          </div>
        )}

        {pwEditing && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (pwValid) void savePassword(pw, current.hasPassword ? 'Password changed.' : 'Password set.')
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium">
                {current.hasPassword ? 'New password' : 'Password'}
              </label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                aria-invalid={pwMismatch ? true : undefined}
                className={inputClass}
              />
            </div>
            {pwMismatch && (
              <p role="alert" className="text-sm text-red-300 sm:col-span-2">
                The passwords do not match.
              </p>
            )}
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button type="submit" disabled={!pwValid || pwBusy} className={buttonClass()}>
                {pwBusy ? 'Saving...' : current.hasPassword ? 'Change password' : 'Set password'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPwEditing(false)
                  setPw('')
                  setPwConfirm('')
                }}
                className={buttonClass('ghost')}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {pwNotice && (
          <div className="mt-4">
            <NoticeText notice={pwNotice} />
          </div>
        )}
      </Section>

      <Section id="network" title="Network" description="Addresses other devices on this Wi-Fi can use to reach Dramabox.">
        {lanUrls.length > 0 ? (
          <ul className="space-y-2">
            {lanUrls.map((url) => (
              <LanUrlRow key={url} url={url} />
            ))}
          </ul>
        ) : (
          <p className="rounded-md border border-line px-3 py-2 text-sm text-muted">
            No LAN address was detected. Use this computer's IP address with port 8096.
          </p>
        )}
        <div className="mt-5 space-y-2">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={current.mdns}
              disabled={mdnsBusy}
              onChange={(e) => void toggleMdns(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Advertise on network (mDNS)
          </label>
          <p className="text-xs text-muted">Lets devices on this network find the server as "Dramabox Server" without typing an address.</p>
          {mdnsNotice && <NoticeText notice={mdnsNotice} />}
        </div>
      </Section>

      <MediaServers integrations={current.integrations} onChanged={(cfg) => setConfig(cfg)} />

      <Section id="library" title="Library" description="Re-read the download folder to pick up or remove episodes.">
        <div className="flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => void scan()} disabled={scanning} className={buttonClass('ghost')}>
            {scanning ? 'Scanning...' : 'Scan library'}
          </button>
          {scanNotice && <NoticeText notice={scanNotice} />}
        </div>
      </Section>

      <Section id="profiles-link" title="Profiles" description="Add, edit or remove the people who can watch on this server.">
        <Link to="/profiles?manage=1" className={buttonClass('ghost')}>
          Manage profiles
        </Link>
      </Section>

      <SystemHealth />
    </div>
  )
}

