import { useEffect, useRef, useState } from 'react'
import type { AppConfig } from '@shared/types'

interface Props {
  onClose: () => void
}

type TestState = 'idle' | 'testing' | 'ok' | 'error'

export default function SettingsModal({ onClose }: Props): JSX.Element {
  // IGDB state
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [igdbTestState, setIgdbTestState] = useState<TestState>('idle')
  const [igdbTestError, setIgdbTestError] = useState<string>('')
  const [igdbSaved, setIgdbSaved] = useState(false)

  // Steam state
  const [steamApiKey, setSteamApiKey] = useState('')
  const [steamIdInput, setSteamIdInput] = useState('')
  const [steamResolvedId, setSteamResolvedId] = useState<string>('')
  const [steamTestState, setSteamTestState] = useState<TestState>('idle')
  const [steamTestError, setSteamTestError] = useState<string>('')
  const [steamSaved, setSteamSaved] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)

  // Load current config on mount
  useEffect(() => {
    window.api.getConfig().then((cfg: AppConfig) => {
      if (cfg.igdb) {
        setClientId(cfg.igdb.clientId)
        setClientSecret(cfg.igdb.clientSecret)
        setIgdbTestState('ok')
      }
      if (cfg.steam) {
        setSteamApiKey(cfg.steam.apiKey)
        setSteamIdInput(cfg.steam.steamId)
        setSteamTestState('ok')
      }
    })
  }, [])

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleOverlayClick = (e: React.MouseEvent): void => {
    if (e.target === overlayRef.current) onClose()
  }

  // IGDB handlers
  const handleIgdbTest = async (): Promise<void> => {
    setIgdbTestState('testing')
    setIgdbTestError('')
    setIgdbSaved(false)
    try {
      const result = await window.api.testIgdb(clientId, clientSecret)
      if (result.ok) {
        setIgdbTestState('ok')
      } else {
        setIgdbTestState('error')
        setIgdbTestError(result.error ?? 'Unknown error')
      }
    } catch (err) {
      setIgdbTestState('error')
      setIgdbTestError(err instanceof Error ? err.message : 'Unexpected error — check that the app was rebuilt')
    }
  }

  const handleIgdbSave = async (): Promise<void> => {
    const cfg = await window.api.getConfig()
    const updated: AppConfig = { ...cfg }
    if (clientId.trim() && clientSecret.trim()) {
      updated.igdb = { clientId: clientId.trim(), clientSecret: clientSecret.trim() }
    } else {
      delete updated.igdb
    }
    await window.api.saveConfig(updated)
    setIgdbSaved(true)
    setTimeout(() => setIgdbSaved(false), 2000)
  }

  const handleIgdbClear = async (): Promise<void> => {
    setClientId('')
    setClientSecret('')
    setIgdbTestState('idle')
    setIgdbTestError('')
    const cfg = await window.api.getConfig()
    const updated: AppConfig = { ...cfg }
    delete updated.igdb
    await window.api.saveConfig(updated)
    setIgdbSaved(true)
    setTimeout(() => setIgdbSaved(false), 2000)
  }

  // Steam handlers
  const handleSteamTest = async (): Promise<void> => {
    setSteamTestState('testing')
    setSteamTestError('')
    setSteamResolvedId('')
    setSteamSaved(false)
    try {
      const result = await window.api.testSteam(steamApiKey, steamIdInput)
      if (result.ok) {
        setSteamTestState('ok')
        if (result.resolvedId && result.resolvedId !== steamIdInput) {
          setSteamResolvedId(result.resolvedId)
        }
      } else {
        setSteamTestState('error')
        setSteamTestError(result.error ?? 'Unknown error')
      }
    } catch (err) {
      setSteamTestState('error')
      setSteamTestError(err instanceof Error ? err.message : 'Unexpected error — check that the app was rebuilt')
    }
  }

  const handleSteamSave = async (): Promise<void> => {
    const idToSave = steamResolvedId || steamIdInput.trim()
    const cfg = await window.api.getConfig()
    const updated: AppConfig = { ...cfg }
    if (steamApiKey.trim() && idToSave) {
      updated.steam = { apiKey: steamApiKey.trim(), steamId: idToSave }
      // Update input to show resolved ID
      if (steamResolvedId) setSteamIdInput(steamResolvedId)
    } else {
      delete updated.steam
    }
    await window.api.saveConfig(updated)
    setSteamSaved(true)
    setTimeout(() => setSteamSaved(false), 2000)
  }

  const handleSteamClear = async (): Promise<void> => {
    setSteamApiKey('')
    setSteamIdInput('')
    setSteamResolvedId('')
    setSteamTestState('idle')
    setSteamTestError('')
    const cfg = await window.api.getConfig()
    const updated: AppConfig = { ...cfg }
    delete updated.steam
    await window.api.saveConfig(updated)
    setSteamSaved(true)
    setTimeout(() => setSteamSaved(false), 2000)
  }

  const igdbConfigured = !!(clientId && clientSecret)
  const steamConfigured = !!(steamApiKey && steamIdInput)

  return (
    <div className="settings-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">

        {/* Header */}
        <div className="settings-header">
          <h2 className="settings-title">Settings</h2>
          <button className="settings-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* IGDB / Twitch section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon igdb-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M4 4v16h6v-6h4v6h6V4H4zm4 8H6V6h2v6zm4 0h-2V6h2v6zm4 0h-2V6h2v6z" fill="#9b59b6"/>
              </svg>
            </div>
            <div>
              <h3 className="settings-section-title">IGDB Metadata</h3>
              <p className="settings-section-desc">
                Fetch rich descriptions, ratings, and screenshots via IGDB (powered by Twitch).
                Requires a free Twitch Developer app.
              </p>
            </div>
          </div>

          {/* Status pill */}
          <div className={`igdb-status igdb-status--${igdbConfigured ? (igdbTestState === 'ok' ? 'connected' : igdbTestState === 'error' ? 'error' : 'unchecked') : 'none'}`}>
            <span className="igdb-status__dot" />
            <span className="igdb-status__label">
              {!igdbConfigured ? 'Not configured' :
               igdbTestState === 'ok' ? 'Connected' :
               igdbTestState === 'error' ? 'Connection failed' :
               igdbTestState === 'testing' ? 'Testing…' : 'Not tested'}
            </span>
          </div>

          {/* Instructions */}
          <div className="settings-steps">
            <p className="settings-steps-title">How to get your credentials:</p>
            <ol className="settings-steps-list">
              <li>Go to <button className="settings-link" onClick={() => window.open('https://dev.twitch.tv/console/apps/create')}>dev.twitch.tv/console/apps/create</button></li>
              <li>Create an app — name it anything, set OAuth Redirect URL to <code>http://localhost</code></li>
              <li>Copy the <strong>Client ID</strong> and generate a <strong>Client Secret</strong></li>
              <li>Paste them below and click Test</li>
            </ol>
          </div>

          {/* Credential fields */}
          <div className="settings-fields">
            <label className="settings-label">
              Client ID
              <input
                type="text"
                className="settings-input"
                value={clientId}
                onChange={(e) => { setClientId(e.target.value); setIgdbTestState('idle') }}
                placeholder="abc123def456..."
                spellCheck={false}
                autoComplete="off"
              />
            </label>

            <label className="settings-label">
              Client Secret
              <input
                type="password"
                className="settings-input"
                value={clientSecret}
                onChange={(e) => { setClientSecret(e.target.value); setIgdbTestState('idle') }}
                placeholder="••••••••••••••••••••"
                autoComplete="off"
              />
            </label>
          </div>

          {/* Error message */}
          {igdbTestState === 'error' && igdbTestError && (
            <p className="settings-error">{igdbTestError}</p>
          )}

          {/* Action buttons */}
          <div className="settings-actions">
            <button
              className="settings-btn settings-btn--test"
              onClick={handleIgdbTest}
              disabled={!clientId.trim() || !clientSecret.trim() || igdbTestState === 'testing'}
            >
              {igdbTestState === 'testing' ? 'Testing…' : igdbTestState === 'ok' ? '✓ Connection OK' : 'Test Connection'}
            </button>

            <button
              className="settings-btn settings-btn--save"
              onClick={handleIgdbSave}
              disabled={!clientId.trim() || !clientSecret.trim()}
            >
              {igdbSaved ? '✓ Saved' : 'Save'}
            </button>

            {igdbConfigured && (
              <button className="settings-btn settings-btn--clear" onClick={handleIgdbClear}>
                Clear
              </button>
            )}
          </div>
        </section>

        {/* Steam Web API section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <div className="settings-section-icon steam-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12c0 4.24 2.65 7.86 6.39 9.29L12 13h-.01c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1v.01l3.79-5.26A7 7 0 0 0 12 5c-3.86 0-7 3.14-7 7h2a5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5c-.28 0-.55-.02-.82-.06L8.3 20.4C9.44 20.79 10.7 21 12 21c5.52 0 10-4.48 10-10S17.52 2 12 2zm-2 14.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" fill="#1b9cf2"/>
              </svg>
            </div>
            <div>
              <h3 className="settings-section-title">Steam Web API</h3>
              <p className="settings-section-desc">
                Pull playtime and last-played data for EA/Epic games that also exist in your Steam library
                (e.g. Jedi Fallen Order, Battlefront II). Requires a free Steam API key.
              </p>
            </div>
          </div>

          {/* Status pill */}
          <div className={`igdb-status igdb-status--${steamConfigured ? (steamTestState === 'ok' ? 'connected' : steamTestState === 'error' ? 'error' : 'unchecked') : 'none'}`}>
            <span className="igdb-status__dot" />
            <span className="igdb-status__label">
              {!steamConfigured ? 'Not configured' :
               steamTestState === 'ok' ? 'Connected' :
               steamTestState === 'error' ? 'Connection failed' :
               steamTestState === 'testing' ? 'Testing…' : 'Not tested'}
            </span>
          </div>

          {/* Instructions */}
          <div className="settings-steps">
            <p className="settings-steps-title">How to connect:</p>
            <ol className="settings-steps-list">
              <li>Get a free API key at <button className="settings-link" onClick={() => window.open('https://steamcommunity.com/dev/apikey')}>steamcommunity.com/dev/apikey</button></li>
              <li>Enter your <strong>Steam ID</strong> (17-digit number) or your <strong>Steam username</strong> — either works</li>
              <li>Set your Steam profile and Game Details to <strong>Public</strong> in Steam privacy settings</li>
              <li>Click Test — GameGatherer will resolve your username to a Steam ID automatically</li>
            </ol>
          </div>

          {/* Credential fields */}
          <div className="settings-fields">
            <label className="settings-label">
              Steam Web API Key
              <input
                type="password"
                className="settings-input"
                value={steamApiKey}
                onChange={(e) => { setSteamApiKey(e.target.value); setSteamTestState('idle'); setSteamResolvedId('') }}
                placeholder="••••••••••••••••••••••••••••••••"
                autoComplete="off"
              />
            </label>

            <label className="settings-label">
              Steam ID or Username
              <input
                type="text"
                className="settings-input"
                value={steamIdInput}
                onChange={(e) => { setSteamIdInput(e.target.value); setSteamTestState('idle'); setSteamResolvedId('') }}
                placeholder="76561198012345678 or your_username"
                spellCheck={false}
                autoComplete="off"
              />
            </label>
          </div>

          {/* Resolved ID notice */}
          {steamResolvedId && (
            <p className="settings-resolved-id">
              Username resolved to Steam ID: <strong>{steamResolvedId}</strong> — this ID will be saved.
            </p>
          )}

          {/* Error message */}
          {steamTestState === 'error' && steamTestError && (
            <p className="settings-error">{steamTestError}</p>
          )}

          {/* Action buttons */}
          <div className="settings-actions">
            <button
              className="settings-btn settings-btn--test"
              onClick={handleSteamTest}
              disabled={!steamApiKey.trim() || !steamIdInput.trim() || steamTestState === 'testing'}
            >
              {steamTestState === 'testing' ? 'Testing…' : steamTestState === 'ok' ? '✓ Connection OK' : 'Test Connection'}
            </button>

            <button
              className="settings-btn settings-btn--save"
              onClick={handleSteamSave}
              disabled={!steamApiKey.trim() || !steamIdInput.trim()}
            >
              {steamSaved ? '✓ Saved' : 'Save'}
            </button>

            {steamConfigured && (
              <button className="settings-btn settings-btn--clear" onClick={handleSteamClear}>
                Clear
              </button>
            )}
          </div>
        </section>

      </div>
    </div>
  )
}
