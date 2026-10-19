import { useState, type FormEvent, type ReactNode } from 'react'
import {
  api,
  type Config,
  type IntegrationResult,
  type IntegrationTest,
  type IntegrationsPatch,
  type Integrations,
  type JellyfinIntegration,
  type PlexIntegration,
} from '../api'
import { errorMessage, fmtAgo } from '../lib/format'
import { Section, NoticeText, buttonClass, inputClass, type Notice } from './ui'

interface Props {
  integrations: Integrations
  onChanged: (config: Config) => void
}

export function MediaServers({ integrations, onChanged }: Props) {
  return (
    <Section
      id="media"
      title="Media servers"
      description="Ask Jellyfin or Plex to rescan after downloads finish. Refreshes are batched: one call about 30 seconds after the last download."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <JellyfinCard config={integrations.jellyfin} onChanged={onChanged} />
        <PlexCard config={integrations.plex} onChanged={onChanged} />
      </div>
    </Section>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-ink/40 p-4 sm:p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  )
}

function ToggleField({ id, checked, onChange }: { id: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-3 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-accent" />
      Enabled
    </label>
  )
}

function LastResult({ result }: { result: IntegrationResult | null }) {
  if (!result) return <p className="text-sm text-muted">No refresh has run yet.</p>
  return (
    <div role="status" className="space-y-1 text-sm">
      <p className={result.ok ? 'text-emerald-300' : 'text-red-300'}>
        Last refresh: {result.ok ? 'ok' : 'failed'} · {fmtAgo(result.at)}
      </p>
      {!result.ok && result.error && <p className="break-words text-red-200">{result.error}</p>}
    </div>
  )
}

function Actions({
  onTest,
  testing,
  onRefresh,
  refreshing,
  saving,
  notice,
}: {
  onTest: () => void
  testing: boolean
  onRefresh: () => void
  refreshing: boolean
  saving: boolean
  notice: Notice | null
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className={buttonClass()}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onTest} disabled={testing} className={buttonClass('ghost')}>
          {testing ? 'Testing...' : 'Test'}
        </button>
        <button type="button" onClick={onRefresh} disabled={refreshing} className={buttonClass('ghost')}>
          {refreshing ? 'Refreshing...' : 'Refresh now'}
        </button>
      </div>
      {notice && <NoticeText notice={notice} />}
    </div>
  )
}

function TestResult({ result }: { result: { ok: boolean; text: string } | null }) {
  if (!result) return null
  return (
    <p
      role="status"
      className={`rounded-md border px-3 py-2 text-sm ${
        result.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-red-500/40 bg-red-500/10 text-red-200'
      }`}
    >
      {result.text}
    </p>
  )
}

const SECRET_HINT = 'Stored secrets are hidden. Type a new value to replace it.'

function JellyfinCard({ config, onChanged }: { config: JellyfinIntegration; onChanged: (c: Config) => void }) {
  const [enabled, setEnabled] = useState(config.enabled)
  const [url, setUrl] = useState(config.url)
  const [apiKey, setApiKey] = useState(config.apiKey)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [lastResult, setLastResult] = useState(config.lastResult)

  function describeTest(res: IntegrationTest): { ok: boolean; text: string } {
    if (!res.ok) return { ok: false, text: res.error ?? 'Jellyfin did not respond as expected.' }
    const name = res.name ? `Connected to ${res.name}` : 'Connected to Jellyfin'
    return { ok: true, text: res.version ? `${name} ${res.version}` : name }
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    const patch: NonNullable<IntegrationsPatch['jellyfin']> = {}
    if (enabled !== config.enabled) patch.enabled = enabled
    if (url.trim() !== config.url.trim()) patch.url = url.trim()
    if (apiKey !== config.apiKey) patch.apiKey = apiKey.trim()
    if (Object.keys(patch).length === 0) {
      setNotice({ kind: 'ok', text: 'No changes to save.' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateSettings({ integrations: { jellyfin: patch } })
      onChanged(updated)
      setApiKey(updated.integrations.jellyfin.apiKey)
      setLastResult(updated.integrations.jellyfin.lastResult)
      setNotice({ kind: 'ok', text: 'Jellyfin settings saved.' })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.testIntegration('jellyfin', {
        url: url.trim(),
        ...(apiKey !== config.apiKey ? { apiKey: apiKey.trim() } : {}),
      })
      setTestResult(describeTest(res))
    } catch (err) {
      setTestResult({ ok: false, text: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    setNotice(null)
    try {
      const res = await api.refreshIntegration('jellyfin')
      const cfg = await api.settings()
      onChanged(cfg)
      setLastResult(cfg.integrations.jellyfin.lastResult)
      setNotice(res.ok ? { kind: 'ok', text: 'Jellyfin library refresh requested.' } : { kind: 'err', text: res.error ?? 'Refresh failed.' })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card title="Jellyfin">
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <ToggleField id="jellyfin-enabled" checked={enabled} onChange={setEnabled} />
        <div>
          <label htmlFor="jellyfin-url" className="block text-sm font-medium">
            Server URL
          </label>
          <input
            id="jellyfin-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.1.10:8096"
            spellCheck={false}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="jellyfin-key" className="block text-sm font-medium">
            API key
          </label>
          <input
            id="jellyfin-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            className={`${inputClass} font-mono`}
          />
          <p className="mt-1 text-xs text-muted">{SECRET_HINT}</p>
        </div>
        <TestResult result={testResult} />
        <LastResult result={lastResult} />
        <Actions
          onTest={() => void test()}
          testing={testing}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          saving={saving}
          notice={notice}
        />
      </form>
    </Card>
  )
}

function PlexCard({ config, onChanged }: { config: PlexIntegration; onChanged: (c: Config) => void }) {
  const [enabled, setEnabled] = useState(config.enabled)
  const [url, setUrl] = useState(config.url)
  const [token, setToken] = useState(config.token)
  const [sectionId, setSectionId] = useState(config.sectionId)
  const [sections, setSections] = useState<{ id: number | string; title: string }[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [lastResult, setLastResult] = useState(config.lastResult)

  async function save(e: FormEvent) {
    e.preventDefault()
    const patch: NonNullable<IntegrationsPatch['plex']> = {}
    if (enabled !== config.enabled) patch.enabled = enabled
    if (url.trim() !== config.url.trim()) patch.url = url.trim()
    if (sectionId !== config.sectionId) patch.sectionId = sectionId
    if (token !== config.token) patch.token = token.trim()
    if (Object.keys(patch).length === 0) {
      setNotice({ kind: 'ok', text: 'No changes to save.' })
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const updated = await api.updateSettings({ integrations: { plex: patch } })
      onChanged(updated)
      setToken(updated.integrations.plex.token)
      setLastResult(updated.integrations.plex.lastResult)
      setNotice({ kind: 'ok', text: 'Plex settings saved.' })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.testIntegration('plex', {
        url: url.trim(),
        ...(token !== config.token ? { token: token.trim() } : {}),
      })
      if (!res.ok) {
        setTestResult({ ok: false, text: res.error ?? 'Plex did not respond as expected.' })
        return
      }
      setSections(res.sections ?? [])
      const count = res.sections?.length ?? 0
      setTestResult({
        ok: true,
        text: `Connected to Plex${res.version ? ` ${res.version}` : ''}. ${count} section${count === 1 ? '' : 's'} found.`,
      })
    } catch (err) {
      setTestResult({ ok: false, text: errorMessage(err) })
    } finally {
      setTesting(false)
    }
  }

  async function refresh() {
    setRefreshing(true)
    setNotice(null)
    try {
      const res = await api.refreshIntegration('plex')
      const cfg = await api.settings()
      onChanged(cfg)
      setLastResult(cfg.integrations.plex.lastResult)
      setNotice(res.ok ? { kind: 'ok', text: 'Plex library refresh requested.' } : { kind: 'err', text: res.error ?? 'Refresh failed.' })
    } catch (err) {
      setNotice({ kind: 'err', text: errorMessage(err) })
    } finally {
      setRefreshing(false)
    }
  }

  const options = sections ?? []
  const hasCurrent = sectionId !== '' && !options.some((s) => String(s.id) === sectionId)

  return (
    <Card title="Plex">
      <form onSubmit={(e) => void save(e)} className="space-y-4">
        <ToggleField id="plex-enabled" checked={enabled} onChange={setEnabled} />
        <div>
          <label htmlFor="plex-url" className="block text-sm font-medium">
            Server URL
          </label>
          <input
            id="plex-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://192.168.1.10:32400"
            spellCheck={false}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="plex-token" className="block text-sm font-medium">
            Plex token
          </label>
          <input
            id="plex-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            className={`${inputClass} font-mono`}
          />
          <p className="mt-1 text-xs text-muted">{SECRET_HINT}</p>
        </div>
        <div>
          <label htmlFor="plex-section" className="block text-sm font-medium">
            Library section
          </label>
          <select
            id="plex-section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className={inputClass}
          >
            <option value="">All sections</option>
            {hasCurrent && <option value={sectionId}>Section {sectionId}</option>}
            {options.map((s) => (
              <option key={String(s.id)} value={String(s.id)}>
                {s.title} (#{String(s.id)})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">Run Test to load the sections from your server.</p>
        </div>
        <TestResult result={testResult} />
        <LastResult result={lastResult} />
        <Actions
          onTest={() => void test()}
          testing={testing}
          onRefresh={() => void refresh()}
          refreshing={refreshing}
          saving={saving}
          notice={notice}
        />
      </form>
    </Card>
  )
}
