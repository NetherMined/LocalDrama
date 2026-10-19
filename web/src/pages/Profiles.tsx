import { useCallback, useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type Profile, type ProfileInput } from '../api'
import { LockIcon, PencilIcon, PlusIcon, TrashIcon } from '../components/icons'
import { PROFILE_COLORS, ProfileAvatar, profileInitial } from '../components/ProfileAvatar'
import { PinDialog } from '../components/PinDialog'
import { ErrorPanel, Section, Spinner, buttonClass, inputClass } from '../components/ui'
import { errorMessage, safeNext } from '../lib/format'
import { useStatus } from '../status'

function pinErrorMessage(err: unknown): string {
  const message = errorMessage(err)
  return message === 'invalid_pin' ? 'Incorrect PIN. Try again.' : message
}

export function Profiles() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const { status, reload } = useStatus()
  const canManage = status?.profile?.isAdmin === true
  const [manageRequested, setManageRequested] = useState(params.get('manage') === '1')
  const managing = manageRequested && canManage

  const [profiles, setProfiles] = useState<Profile[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pinTarget, setPinTarget] = useState<Profile | null>(null)
  const [choosingId, setChoosingId] = useState<number | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const loadProfiles = useCallback(async () => {
    try {
      const res = await api.profiles()
      setProfiles(res.items)
      setLoadError(null)
    } catch (err) {
      setLoadError(errorMessage(err))
    }
  }, [])

  useEffect(() => {
    void loadProfiles()
  }, [loadProfiles])

  async function choose(profile: Profile, pin?: string) {
    setChoosingId(profile.id)
    setPageError(null)
    try {
      await api.selectProfile(profile.id, pin)
      await reload()
      navigate(next, { replace: true })
    } finally {
      setChoosingId(null)
    }
  }

  function pickProfile(profile: Profile) {
    if (profile.hasPin) {
      setPinTarget(profile)
      return
    }
    choose(profile).catch((err) => setPageError(errorMessage(err)))
  }

  async function submitPin(pin: string) {
    if (!pinTarget) return
    try {
      await choose(pinTarget, pin)
      setPinTarget(null)
    } catch (err) {
      throw new Error(pinErrorMessage(err))
    }
  }

  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    const tiles = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-tile]'))
    const idx = tiles.indexOf(document.activeElement as HTMLButtonElement)
    if (idx < 0 || tiles.length === 0) return
    e.preventDefault()
    const firstRowTop = tiles[0].offsetTop
    const cols = Math.max(1, tiles.filter((t) => t.offsetTop === firstRowTop).length)
    const target =
      e.key === 'ArrowRight' ? idx + 1
      : e.key === 'ArrowLeft' ? idx - 1
      : e.key === 'ArrowDown' ? idx + cols
      : idx - cols
    tiles[Math.min(tiles.length - 1, Math.max(0, target))]?.focus()
  }

  const heading = managing ? 'Manage profiles' : "Who's watching?"

  return (
    <div className="flex min-h-[70vh] flex-col items-center gap-10 py-8">
      <div className="flex w-full flex-wrap items-center justify-center gap-4 sm:justify-between">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h1>
        {managing && (
          <button type="button" onClick={() => setManageRequested(false)} className={buttonClass('ghost')}>
            Done
          </button>
        )}
      </div>

      {loadError && <ErrorPanel title="Profiles could not load" message={loadError} onRetry={() => void loadProfiles()} />}
      {!loadError && profiles === null && <Spinner label="Loading profiles" />}

      {profiles && profiles.length === 0 && !managing && (
        <p className="text-sm text-muted">No profiles yet. An admin can add one from Manage profiles.</p>
      )}

      {profiles && profiles.length > 0 && !managing && (
        <div
          role="group"
          aria-label="Profiles"
          onKeyDown={onGridKey}
          className="grid w-full grid-cols-2 justify-items-center gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-4"
        >
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              data-tile
              onClick={() => pickProfile(profile)}
              disabled={choosingId !== null}
              aria-label={profile.hasPin ? `${profile.name}, PIN required` : profile.name}
              className="group flex flex-col items-center gap-3 rounded-xl outline-none disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                style={{ backgroundColor: profile.color }}
                className="flex h-32 w-32 items-center justify-center gap-2 rounded-xl text-5xl font-bold text-white shadow-lg shadow-black/40 transition group-hover:scale-105 group-hover:ring-4 group-hover:ring-white/80 group-focus-visible:ring-4 group-focus-visible:ring-white sm:h-40 sm:w-40"
              >
                {profileInitial(profile.name)}
                {profile.hasPin && <LockIcon className="h-5 w-5 opacity-80" />}
              </span>
              <span className="max-w-36 truncate text-base font-medium text-white/90 group-hover:text-white">
                {choosingId === profile.id ? 'Opening...' : profile.name}
              </span>
            </button>
          ))}
        </div>
      )}

      {canManage && !managing && (
        <button type="button" onClick={() => setManageRequested(true)} className={buttonClass('ghost')}>
          Manage profiles
        </button>
      )}

      {pageError && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {pageError}
        </p>
      )}

      {managing && (
        <ManageProfiles
          profiles={profiles ?? []}
          onChanged={async () => {
            await loadProfiles()
            await reload()
          }}
        />
      )}

      {pinTarget && (
        <PinDialog
          title={`PIN for ${pinTarget.name}`}
          onSubmit={submitPin}
          onClose={() => {
            if (choosingId === null) setPinTarget(null)
          }}
        />
      )}
    </div>
  )
}

type Editor = { mode: 'new' } | { mode: 'edit'; profile: Profile }

function ManageProfiles({ profiles, onChanged }: { profiles: Profile[]; onChanged: () => Promise<void> }) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [rowError, setRowError] = useState<string | null>(null)

  async function remove(profile: Profile) {
    if (!window.confirm(`Delete the profile "${profile.name}"? Its watch progress will be removed too.`)) return
    setRowError(null)
    try {
      await api.deleteProfile(profile.id)
      await onChanged()
    } catch (err) {
      setRowError(errorMessage(err))
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-6">
      {rowError && (
        <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {rowError}
        </p>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-panel">
        {profiles.map((profile) => (
          <li key={profile.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <ProfileAvatar name={profile.name} color={profile.color} className="h-10 w-10 text-base" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{profile.name}</p>
              <p className="text-xs text-muted">
                {profile.isAdmin ? 'Admin' : 'Member'}
                {profile.hasPin ? ' · PIN set' : ''}
              </p>
            </div>
            <button type="button" onClick={() => setEditor({ mode: 'edit', profile })} className={buttonClass('ghost')}>
              <PencilIcon />
              Edit
            </button>
            <button
              type="button"
              onClick={() => void remove(profile)}
              aria-label={`Delete ${profile.name}`}
              className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-red-300 transition hover:bg-red-500/15"
            >
              <TrashIcon />
              Delete
            </button>
          </li>
        ))}
      </ul>

      {editor ? (
        <ProfileForm
          key={editor.mode === 'edit' ? `edit-${editor.profile.id}` : 'new'}
          editor={editor}
          onCancel={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null)
            await onChanged()
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditor({ mode: 'new' })} className={buttonClass()}>
          <PlusIcon />
          Add profile
        </button>
      )}
    </div>
  )
}

function ProfileForm({
  editor,
  onCancel,
  onSaved,
}: {
  editor: Editor
  onCancel: () => void
  onSaved: () => Promise<void>
}) {
  const existing = editor.mode === 'edit' ? editor.profile : null
  const [name, setName] = useState(existing?.name ?? '')
  const [color, setColor] = useState<string>(existing?.color ?? PROFILE_COLORS[0])
  const [isAdmin, setIsAdmin] = useState(existing?.isAdmin ?? false)
  const [pin, setPin] = useState('')
  const [pinRemove, setPinRemove] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name for this profile.')
      return
    }
    if (pin && !/^\d{4,6}$/.test(pin)) {
      setError('A PIN must be 4 to 6 digits.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (existing) {
        const patch: ProfileInput = { name: trimmed, color, isAdmin }
        if (pinRemove) patch.pin = ''
        else if (pin) patch.pin = pin
        await api.updateProfile(existing.id, patch)
      } else {
        const input: ProfileInput & { name: string } = { name: trimmed, color, isAdmin }
        if (pin) input.pin = pin
        await api.createProfile(input)
      }
      await onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section id="profile-editor" title={existing ? `Edit ${existing.name}` : 'New profile'}>
      <form onSubmit={(e) => void save(e)} className="space-y-6">
        <div>
          <label htmlFor="profile-name" className="block text-sm font-medium">
            Name
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            maxLength={32}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} sm:max-w-sm`}
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Color</legend>
          <div role="radiogroup" aria-label="Color" className="mt-3 flex flex-wrap gap-3">
            {PROFILE_COLORS.map((c) => (
              <label key={c} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="profile-color"
                  value={c}
                  checked={color === c}
                  onChange={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: c }}
                  className="block h-10 w-10 rounded-full ring-offset-2 ring-offset-panel transition peer-checked:ring-2 peer-checked:ring-white peer-focus-visible:ring-2 peer-focus-visible:ring-accent-hi"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <p className="text-sm font-medium">PIN</p>
          {existing?.hasPin && !pinRemove && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>A PIN is set.</span>
              <button type="button" onClick={() => setPinRemove(true)} className={buttonClass('danger')}>
                Remove PIN
              </button>
            </div>
          )}
          {pinRemove && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted">
              <span>The PIN will be removed when you save.</span>
              <button type="button" onClick={() => setPinRemove(false)} className={buttonClass('ghost')}>
                Keep PIN
              </button>
            </div>
          )}
          {!pinRemove && (
            <>
              <label htmlFor="profile-pin" className="mt-3 block text-sm text-muted">
                {existing?.hasPin ? 'New PIN (leave blank to keep the current PIN)' : 'PIN (optional, 4 to 6 digits)'}
              </label>
              <input
                id="profile-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                className={`${inputClass} font-mono tracking-[0.3em] sm:max-w-xs`}
              />
            </>
          )}
        </div>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          Administrator (can manage profiles and settings)
        </label>

        {error && (
          <p role="alert" className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className={buttonClass()}>
            {saving ? 'Saving...' : existing ? 'Save profile' : 'Add profile'}
          </button>
          <button type="button" onClick={onCancel} className={buttonClass('ghost')}>
            Cancel
          </button>
        </div>
      </form>
    </Section>
  )
}
