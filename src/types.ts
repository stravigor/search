// ── Documents ─────────────────────────────────────────────────────────────

export interface SearchDocument {
  id: string | number
  [key: string]: unknown
}

// ── Index settings ────────────────────────────────────────────────────────

export interface IndexSettings {
  /** Fields to use for full-text search. */
  searchableAttributes?: string[]
  /** Fields to return in results. */
  displayedAttributes?: string[]
  /** Fields that can be used as filters. */
  filterableAttributes?: string[]
  /** Fields that can be used for sorting. */
  sortableAttributes?: string[]
  /** Primary key field name (defaults to 'id'). */
  primaryKey?: string
}

// ── Search options & results ──────────────────────────────────────────────

export interface SearchOptions {
  /** Filters — key-value pairs or engine-native filter string. */
  filter?: Record<string, unknown> | string
  /** Sort by field(s), e.g. ['created_at:desc']. */
  sort?: string[]
  /** Page number (1-based). */
  page?: number
  /** Results per page. */
  perPage?: number
  /** Fields to return in results. */
  attributesToRetrieve?: string[]
  /** Fields to highlight in results. */
  attributesToHighlight?: string[]
}

export interface SearchResult {
  /** The matching documents. */
  hits: SearchHit[]
  /** Total number of matching documents (estimated). */
  totalHits: number
  /** Current page. */
  page: number
  /** Results per page. */
  perPage: number
  /** Processing time in milliseconds (if provided by the engine). */
  processingTimeMs?: number
}

export interface SearchHit {
  /** The document data. */
  document: Record<string, unknown>
  /** Highlighted fields (if requested). */
  highlights?: Record<string, string>
}

// ── Configuration ─────────────────────────────────────────────────────────

export interface SearchConfig {
  /** Default driver name. */
  default: string
  /** Index name prefix (e.g. 'myapp_'). */
  prefix: string
  /** Driver configurations keyed by name. */
  drivers: Record<string, DriverConfig>
}

export interface DriverConfig {
  driver: string
  host?: string
  port?: number
  apiKey?: string
  /** Algolia application ID. */
  appId?: string
  /** Protocol — 'http' or 'https'. */
  protocol?: string
  [key: string]: unknown
}
