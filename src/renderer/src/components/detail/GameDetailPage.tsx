import { useEffect, useState, useRef, useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Game, GameMetadata, StoreRating } from '@shared/types'
import { useGameStore } from '../../store/useGameStore'
import CoverArt from '../library/CoverArt'
import Badge from '../ui/Badge'

marked.setOptions({ gfm: true, breaks: true })

// Detect whether a description string is HTML or markdown/plain-text.
// Steam API returns HTML; IGDB/Epic return markdown or plain text.
const HTML_TAG_RE = /<[a-z][^>]*>/i

function renderDescription(text: string): string {
  if (HTML_TAG_RE.test(text)) {
    // Native HTML (Steam API) — sanitize with defaults (keeps img/strong/h1-h6/etc.)
    return DOMPurify.sanitize(text)
  }
  // Markdown or plain text — strip leading whitespace per line first so that
  // tab-indented lines (common in raw text scraped from HTML) don't trigger
  // marked's indented-code-block rule, then parse and sanitize.
  const normalised = text.replace(/^[ \t]+/gm, '')
  return DOMPurify.sanitize(marked.parse(normalised) as string)
}

// ─── Rating display ───────────────────────────────────────────────────────────

function SteamRatingBar({ rating }: { rating: StoreRating }): JSX.Element {
  const total = rating.reviewCount ?? 0
  const positive = rating.positiveCount ?? 0
  const posPct = total > 0 ? Math.round((positive / total) * 100) : (rating.score ?? 0)
  const negPct = 100 - posPct

  const label =
    posPct >= 95 ? 'Overwhelmingly Positive' :
    posPct >= 85 ? 'Very Positive' :
    posPct >= 70 ? 'Mostly Positive' :
    posPct >= 40 ? 'Mixed' :
    posPct >= 20 ? 'Mostly Negative' : 'Overwhelmingly Negative'

  return (
    <div className="rating-steam">
      <div className="rating-steam__bar-track">
        <div className="rating-steam__bar-pos" style={{ width: `${posPct}%` }} />
        <div className="rating-steam__bar-neg" style={{ width: `${negPct}%` }} />
      </div>
      <div className="rating-steam__pcts">
        <span className="rating-steam__pct-pos">{posPct}% positive</span>
        <span className="rating-steam__pct-neg">{negPct}% negative</span>
      </div>
      <span className="rating-steam__label">{label}</span>
    </div>
  )
}

function RatingBlock({ rating, igdbRating }: { rating?: StoreRating; igdbRating?: number }): JSX.Element | null {
  if (!rating && !igdbRating) return null

  return (
    <div className="detail-rating">
      {rating?.format === 'steam_reviews' && rating.score != null && (
        <div>
          <SteamRatingBar rating={rating} />
          {rating.reviewCount != null && (
            <p className="rating-reviews">
              {rating.positiveCount?.toLocaleString()} positive · {rating.reviewCount.toLocaleString()} total reviews
            </p>
          )}
        </div>
      )}
      {rating?.format === 'metacritic' && rating.score != null && (
        <div className="rating-score" style={{ background: rating.score >= 75 ? '#4caf50' : rating.score >= 50 ? '#ff9800' : '#f44336' }}>
          <span>{rating.score}</span>
          <small>Metacritic</small>
        </div>
      )}
      {rating?.format === 'none' && rating.label && (
        <p className="rating-label">{rating.label}</p>
      )}
      {igdbRating != null && (
        <div className="rating-igdb">
          <span className="rating-igdb__score">{igdbRating}</span>
          <span className="rating-igdb__label">/100 IGDB</span>
        </div>
      )}
    </div>
  )
}

// ─── Screenshots strip ────────────────────────────────────────────────────────

function Screenshots({ urls }: { urls: string[] }): JSX.Element | null {
  if (!urls.length) return null
  return (
    <div className="detail-screenshots">
      {urls.map((url, i) => (
        <img
          key={i}
          src={url}
          alt=""
          className="detail-screenshot"
          loading="lazy"
          decoding="async"
        />
      ))}
    </div>
  )
}

// ─── Stat row ─────────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value?: string }): JSX.Element | null {
  if (!value) return null
  return (
    <div className="detail-stat-row">
      <span className="detail-stat-label">{label}</span>
      <span className="detail-stat-value">{value}</span>
    </div>
  )
}

// ─── Playtime helpers ─────────────────────────────────────────────────────────

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h.toLocaleString()}h ${m}m` : `${h.toLocaleString()} hours`
}

function formatLastPlayed(ts: number): string {
  const date = new Date(ts * 1000)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  game: Game
  onBack: () => void
}

export default function GameDetailPage({ game, onBack }: Props): JSX.Element {
  const { metadataCache, cacheMetadata } = useGameStore()
  const [meta, setMeta] = useState<GameMetadata | null>(metadataCache.get(game.id) ?? null)
  const [loading, setLoading] = useState(!meta)
  const [expanded, setExpanded] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlFetching, setUrlFetching] = useState(false)
  const [urlError, setUrlError] = useState('')
  const bgRef = useRef<HTMLDivElement>(null)

  const refreshMeta = (): void => {
    setLoading(true)
    setMeta(null)
    window.api.getMetadata(game, true).then((m) => {
      if (m) { setMeta(m); cacheMetadata(game.id, m) }
      setLoading(false)
    })
  }

  useEffect(() => {
    if (meta) return
    setLoading(true)
    window.api.getMetadata(game).then((m) => {
      if (m) {
        setMeta(m)
        cacheMetadata(game.id, m)
      }
      setLoading(false)
    })
  }, [game.id])

  // Parallax background on mouse move
  useEffect(() => {
    const handleMove = (e: MouseEvent): void => {
      if (!bgRef.current) return
      const x = (e.clientX / window.innerWidth - 0.5) * 20
      const y = (e.clientY / window.innerHeight - 0.5) * 20
      bgRef.current.style.transform = `scale(1.15) translate(${x}px, ${y}px)`
    }
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [])

  const handleFetchUrl = (): void => {
    const trimmed = urlInput.trim()
    if (!trimmed.startsWith('http')) { setUrlError('Please enter a valid URL starting with http'); return }
    setUrlFetching(true)
    setUrlError('')
    window.api.fetchStoreDescription(trimmed, game.id).then((fetched) => {
      setUrlFetching(false)
      if (!fetched) { setUrlError('Could not find a description on that page. Try a different URL.'); return }
      // Merge fetched data on top of existing meta, preserving anything already set
      const updated: GameMetadata = {
        ...(meta ?? { gameId: game.id }),
        ...fetched,
        description: fetched.description ?? meta?.description,
        genres: fetched.genres?.length ? fetched.genres : meta?.genres,
        rating: fetched.rating ?? meta?.rating,
        igdbRating: fetched.igdbRating ?? meta?.igdbRating,
      }
      setMeta(updated)
      cacheMetadata(game.id, updated)
    })
  }

  const handleLaunch = (): void => {
    setLaunching(true)
    window.api.launchGame(game).then(() => {
      setTimeout(() => setLaunching(false), 3000)
    })
  }

  const bgImage = meta?.headerImage ?? meta?.screenshots?.[0] ?? game.coverArtUrl

  const descText = meta?.description ?? meta?.shortDescription
  const COLLAPSE_THRESHOLD = 600   // chars before we show "read more"
  const isLong = descText ? descText.length > COLLAPSE_THRESHOLD : false
  const descHtml = useMemo(
    () => (descText ? renderDescription(descText) : null),
    [descText]
  )

  return (
    <div className="detail-page">
      {/* Blurred parallax background */}
      {bgImage && (
        <div
          ref={bgRef}
          className="detail-bg"
          style={{ backgroundImage: `url(${bgImage})` }}
        />
      )}
      <div className="detail-bg-overlay" />

      {/* Top bar */}
      <div className="detail-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="detail-back-btn" onClick={onBack} aria-label="Back to library">
            ← Library
          </button>
          <button className="detail-back-btn" onClick={refreshMeta} disabled={loading} aria-label="Refresh metadata" title="Refresh metadata">
            ↺
          </button>
        </div>
        <button
          className={`detail-play-btn${launching ? ' detail-play-btn--launching' : ''}`}
          onClick={handleLaunch}
          disabled={launching}
        >
          {launching ? 'Launching…' : '▶  Play'}
        </button>
      </div>

      {/* Scrollable content */}
      <div className="detail-content">
        {/* Hero row: cover + info */}
        <div className="detail-hero">
          {/* Cover art */}
          <div className="detail-cover-wrap">
            <CoverArt src={game.coverArtUrl} alt={game.name} className="detail-cover" />
          </div>

          {/* Info column */}
          <div className="detail-info">
            <Badge store={game.store} />
            <h1 className="detail-title">{game.name}</h1>

            <div className="detail-meta-line">
              {(meta?.developer || meta?.publisher) && (
                <span className="detail-devpub">
                  {meta.developer && <span>{meta.developer}</span>}
                  {meta.developer && meta.publisher && meta.developer !== meta.publisher && (
                    <span className="detail-separator">·</span>
                  )}
                  {meta.publisher && meta.publisher !== meta.developer && (
                    <span>{meta.publisher}</span>
                  )}
                </span>
              )}
              {meta?.releaseDate && (
                <span className="detail-release">{meta.releaseDate}</span>
              )}
            </div>

            {/* Rating */}
            {!loading && (
              <RatingBlock rating={meta?.rating} igdbRating={meta?.igdbRating} />
            )}

            {/* Genres */}
            {meta?.genres?.length && (
              <div className="detail-genres">
                {meta.genres.map((g) => (
                  <span key={g} className="detail-genre-chip">{g}</span>
                ))}
              </div>
            )}

            {/* Description */}
            {loading ? (
              <div className="detail-desc-skeleton" />
            ) : descHtml ? (
              <div className="detail-desc-wrap">
                <div
                  className={`detail-desc detail-desc--md${!expanded && isLong ? ' detail-desc--collapsed' : ''}`}
                  dangerouslySetInnerHTML={{ __html: descHtml }}
                />
                {isLong && (
                  <button className="detail-expand-btn" onClick={() => setExpanded((e) => !e)}>
                    {expanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            ) : (
              <div className="detail-url-prompt">
                <p className="detail-url-prompt__label">
                  No description found. Paste the store page URL (EA, Steam, etc.) to fetch one:
                </p>
                <div className="detail-url-prompt__row">
                  <input
                    className="detail-url-prompt__input"
                    type="url"
                    placeholder="https://www.ea.com/games/..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                    disabled={urlFetching}
                  />
                  <button
                    className="detail-url-prompt__btn"
                    onClick={handleFetchUrl}
                    disabled={urlFetching || !urlInput.trim()}
                  >
                    {urlFetching ? 'Fetching…' : 'Fetch'}
                  </button>
                </div>
                {urlError && <p className="detail-url-prompt__error">{urlError}</p>}
              </div>
            )}

            {/* Stats */}
            <div className="detail-stats">
              {game.playtimeMinutes != null && game.playtimeMinutes > 0 && (
                <StatRow label="Playtime" value={formatPlaytime(game.playtimeMinutes)} />
              )}
              {game.lastPlayed && (
                <StatRow label="Last played" value={formatLastPlayed(game.lastPlayed)} />
              )}
              {meta?.website && (
                <div className="detail-stat-row">
                  <span className="detail-stat-label">Website</span>
                  <a
                    className="detail-stat-value detail-link"
                    onClick={() => window.api.openStorePage(game)}
                  >
                    Official site ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Screenshots */}
        {meta?.screenshots?.length ? (
          <div className="detail-screenshots-section">
            <h2 className="detail-section-title">Screenshots</h2>
            <Screenshots urls={meta.screenshots} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
