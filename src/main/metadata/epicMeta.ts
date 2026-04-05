import { fetchJson } from './http'
import type { GameMetadata, StoreRating } from '../../shared/types'

// Known AppName → product slug overrides
const EPIC_SLUG_OVERRIDES: Record<string, string> = {
  Sugar: 'rocket-league',         // Rocket League internal name
  Fortnite: 'fortnite',
  RocketLeague: 'rocket-league',
}

interface EpicKeyImage {
  type: string
  url: string
}

interface EpicPageData {
  about?: {
    keyImages?: EpicKeyImage[]
    shortDescription?: string
    description?: string
    developerDisplayName?: string
    publisherDisplayName?: string
  }
  requirements?: { systems?: { details?: { minimum?: string; recommended?: string }[] }[] }
}

interface EpicProductResponse {
  pages?: Array<{
    data?: EpicPageData
    _title?: string
    type?: string
  }>
  productName?: string
}

function deriveSlugs(appName: string, displayName: string): string[] {
  const slugs: string[] = []

  // Check hardcoded overrides first
  if (EPIC_SLUG_OVERRIDES[appName]) slugs.push(EPIC_SLUG_OVERRIDES[appName])

  // Derive from display name: lowercase, replace non-alphanumerics with hyphens
  const fromDisplay = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  slugs.push(fromDisplay)

  // Derive from appName itself
  const fromApp = appName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (fromApp !== fromDisplay) slugs.push(fromApp)

  return [...new Set(slugs)]
}

async function tryEpicProductSlug(slug: string): Promise<EpicProductResponse | null> {
  return fetchJson<EpicProductResponse>(
    `https://store-content.ak.epicgames.com/api/en-US/content/products/${slug}`
  )
}

export async function fetchEpicMetadata(
  appName: string,
  displayName: string,
  gameId: string,
  catalogNamespace?: string
): Promise<GameMetadata | null> {
  const slugs = deriveSlugs(appName, displayName)

  let product: EpicProductResponse | null = null
  for (const slug of slugs) {
    product = await tryEpicProductSlug(slug)
    if (product?.pages?.length) break
  }

  if (!product?.pages?.length) return null

  // Find the main product page (type 'productHome' or first page)
  const mainPage =
    product.pages.find((p) => p.type === 'productHome') ??
    product.pages[0]

  const about = mainPage?.data?.about
  if (!about) return null

  // Extract cover/key images
  const preferredTypes = ['DieselGameBoxTall', 'DieselGameBoxLogo', 'Thumbnail', 'DieselGameBox']
  let coverUrl: string | undefined
  for (const type of preferredTypes) {
    const img = about.keyImages?.find((k) => k.type === type)
    if (img?.url) { coverUrl = img.url; break }
  }

  // Screenshots: look across all pages for OfferImageWide images
  const screenshots: string[] = []
  for (const page of product.pages) {
    const images = page.data?.about?.keyImages ?? []
    for (const img of images) {
      if (img.type === 'DieselGameBoxWide' || img.type === 'OfferImageWide') {
        screenshots.push(img.url)
      }
    }
    if (screenshots.length >= 8) break
  }

  // Description: try main page first, then search all pages (some games like Rocket League
  // put full description in a sub-page rather than productHome)
  let description = about.description || about.shortDescription || undefined
  let shortDescription = about.shortDescription || undefined
  if (!description) {
    for (const page of product.pages) {
      const pageAbout = page.data?.about
      if (pageAbout?.description) { description = pageAbout.description; break }
      if (!shortDescription && pageAbout?.shortDescription) shortDescription = pageAbout.shortDescription
    }
  }
  if (!description) description = shortDescription

  // Developer/publisher: fall back to searching all pages
  let developer = about.developerDisplayName
  let publisher = about.publisherDisplayName
  if (!developer || !publisher) {
    for (const page of product.pages) {
      const pa = page.data?.about
      if (!developer && pa?.developerDisplayName) developer = pa.developerDisplayName
      if (!publisher && pa?.publisherDisplayName) publisher = pa.publisherDisplayName
      if (developer && publisher) break
    }
  }

  // Epic uses ESRB/PEGI age ratings; they're embedded differently per region.
  // We use a basic "no score" format as Epic doesn't expose numeric user reviews publicly.
  const rating: StoreRating = {
    format: 'none',
    label: 'Available on Epic Games'
  }

  return {
    gameId,
    shortDescription,
    description,
    developer,
    publisher,
    screenshots: screenshots.slice(0, 12),
    headerImage: screenshots[0] ?? coverUrl,
    rating
  }
}

// Fetch only the current cover art URL for an Epic game (used for progressive enrichment)
export async function fetchEpicCoverUrl(catalogNamespace: string): Promise<string | null> {
  // Try namespace as slug first (sometimes they match)
  const slugs = [catalogNamespace]
  for (const slug of slugs) {
    const product = await tryEpicProductSlug(slug)
    if (!product?.pages?.length) continue
    const about = product.pages[0]?.data?.about
    const preferredTypes = ['DieselGameBoxTall', 'Thumbnail', 'DieselGameBox']
    for (const type of preferredTypes) {
      const img = about?.keyImages?.find((k) => k.type === type)
      if (img?.url) return img.url
    }
  }
  return null
}
