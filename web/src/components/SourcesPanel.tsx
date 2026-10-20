import { useEffect, useState } from 'react'
import { buttonClass, NoticeText, type Notice } from './ui'

interface SourceHealth {
  ok: boolean
  error?: string
  at?: string
}

interface Source {
  id: string
  type: string
  name: string
  enabled: boolean
  config: Record<string, string>
  lastHealth: SourceHealth | null
}

interface SourcesResponse {
  activeSourceId: string
  types: { id: string; name: string; description: string }[]
  sources: Source[]
}

export function SourcesPanel() {
  const [data, setData] = useState<SourcesResponse | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editConfig, setEditConfig] = useState<Record<string, string>>({})

  async function load() {
    try {
      const res = await fetch('/api/sources').then((r) => r.json())
      setData(res)
    } catch (err) {
      setNotice({ kind: 'err', text: String(err) })
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function test(id: string) {
    setBusy(id)
    setNotice(null)
    try {
      const health = await fetch(`/api/sources/${id}/test`, { method: 'POST' }).then((r) => r.json())
      setNotice({
        kind: health.ok ? 'ok' : 'err',
        text: health.ok ? `${id} is working` : health.error || 'Test failed',
      })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err) })
    } finally {
      setBusy(null)
    }
  }

  async function activate(id: string) {
    setBusy(id)
    try {
      await fetch(`/api/sources/${id}/activate`, { method: 'POST' })
      setNotice({ kind: 'ok', text: `Switched to ${id}` })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err) })
    } finally {
      setBusy(null)
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    setBusy(id)
    try {
      await fetch(`/api/sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err) })
    } finally {
      setBusy(null)
    }
  }

  async function saveConfig(id: string) {
    setBusy(id)
    try {
      await fetch(`/api/sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: editConfig }),
      })
      setEditing(null)
      setNotice({ kind: 'ok', text: 'Saved' })
      await load()
    } catch (err) {
      setNotice({ kind: 'err', text: String(err) })
    } finally {
      setBusy(null)
    }
  }

  if (!data) return <p className="text-sm text-muted">Loading sources…</p>

  return (
    <div className="space-y-4">
      {notice && <NoticeText notice={notice} />}
      <p className="text-sm text-muted">
        All GoodBos platforms share the same API key (set on the DramaBuzz / GoodBos entry). Toggle platforms on or off.
      </p>
      {data.sources.map((s) => {
        const isActive = s.id === data.activeSourceId
        const health = s.lastHealth
        const statusColor = !health ? 'bg-zinc-500' : health.ok ? 'bg-emerald-500' : 'bg-red-500'
        return (
          <div key={s.id} className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.enabled}
                  disabled={busy === s.id}
                  onChange={(e) => void toggleEnabled(s.id, e.target.checked)}
                  className="h-4 w-4 accent-rose-500"
                />
                <span className="text-sm">Enabled</span>
              </label>
              <span className={`inline-block h-3 w-3 rounded-full ${statusColor}`} />
              <div className="flex-1">
                <div className="font-medium">
                  {s.name} {isActive && <span className="ml-2 text-xs text-emerald-400">ACTIVE</span>}
                </div>
                <div className="text-xs text-muted">{s.type}{s.config.base ? ` · ${s.config.base}` : ''}</div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === s.id}
                  onClick={() => void test(s.id)}
                  className={buttonClass('ghost')}
                >
                  {busy === s.id ? 'Testing…' : 'Test'}
                </button>
                {!isActive && s.enabled && (
                  <button
                    type="button"
                    disabled={busy === s.id}
                    onClick={() => void activate(s.id)}
                    className={buttonClass()}
                  >
                    Use this
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditing(editing === s.id ? null : s.id)
                    setEditConfig({ ...s.config })
                  }}
                  className={buttonClass('ghost')}
                >
                  {editing === s.id ? 'Cancel' : 'Configure'}
                </button>
              </div>
            </div>
            {health && !health.ok && (
              <p className="mt-2 text-sm text-red-300">{health.error}</p>
            )}
            {editing === s.id && (
              <div className="mt-3 space-y-2">
                {(s.type === 'dramabos' || s.type === 'dramabuzz' || s.type === 'goodbos') && (
                  <input
                    placeholder={s.type === 'dramabos' ? 'DramaBos API key' : 'DramaBuzz / GoodBos API key (shared)'}
                    value={editConfig.apiKey || ''}
                    onChange={(e) => setEditConfig({ ...editConfig, apiKey: e.target.value })}
                    className="w-full rounded border border-line bg-ink px-3 py-2 text-sm"
                  />
                )}
                <button type="button" onClick={() => void saveConfig(s.id)} className={buttonClass()}>
                  Save
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
