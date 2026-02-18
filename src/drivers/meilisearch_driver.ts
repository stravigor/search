import { ExternalServiceError } from '@stravigor/kernel'
import type { SearchEngine } from '../search_engine.ts'
import type {
  SearchDocument,
  SearchOptions,
  SearchResult,
  SearchHit,
  IndexSettings,
  DriverConfig,
} from '../types.ts'

/**
 * Meilisearch driver — communicates with the Meilisearch REST API via raw `fetch()`.
 *
 * @see https://www.meilisearch.com/docs/reference/api/overview
 */
export class MeilisearchDriver implements SearchEngine {
  readonly name = 'meilisearch'
  private baseUrl: string
  private apiKey: string

  constructor(config: DriverConfig) {
    const protocol = config.protocol ?? 'http'
    const host = config.host ?? 'localhost'
    const port = config.port ?? 7700
    this.baseUrl = `${protocol}://${host}:${port}`
    this.apiKey = (config.apiKey as string) ?? ''
  }

  // ── Interface ────────────────────────────────────────────────────────────

  async upsert(
    index: string,
    id: string | number,
    document: Record<string, unknown>
  ): Promise<void> {
    await this.request('POST', `/indexes/${encodeURIComponent(index)}/documents`, [
      { id, ...document },
    ])
  }

  async upsertMany(index: string, documents: SearchDocument[]): Promise<void> {
    await this.request('POST', `/indexes/${encodeURIComponent(index)}/documents`, documents)
  }

  async delete(index: string, id: string | number): Promise<void> {
    await this.request(
      'DELETE',
      `/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(String(id))}`
    )
  }

  async deleteMany(index: string, ids: Array<string | number>): Promise<void> {
    await this.request('POST', `/indexes/${encodeURIComponent(index)}/documents/delete-batch`, ids)
  }

  async flush(index: string): Promise<void> {
    await this.request('DELETE', `/indexes/${encodeURIComponent(index)}/documents`)
  }

  async deleteIndex(index: string): Promise<void> {
    await this.request('DELETE', `/indexes/${encodeURIComponent(index)}`)
  }

  async createIndex(index: string, options?: IndexSettings): Promise<void> {
    await this.request('POST', '/indexes', {
      uid: index,
      primaryKey: options?.primaryKey ?? 'id',
    })

    if (options) {
      const settings: Record<string, unknown> = {}
      if (options.searchableAttributes) settings.searchableAttributes = options.searchableAttributes
      if (options.displayedAttributes) settings.displayedAttributes = options.displayedAttributes
      if (options.filterableAttributes) settings.filterableAttributes = options.filterableAttributes
      if (options.sortableAttributes) settings.sortableAttributes = options.sortableAttributes

      if (Object.keys(settings).length > 0) {
        await this.request('PATCH', `/indexes/${encodeURIComponent(index)}/settings`, settings)
      }
    }
  }

  async search(index: string, query: string, options?: SearchOptions): Promise<SearchResult> {
    const perPage = options?.perPage ?? 20
    const page = options?.page ?? 1

    const body: Record<string, unknown> = { q: query, limit: perPage, offset: (page - 1) * perPage }

    if (options?.filter) {
      body.filter =
        typeof options.filter === 'string' ? options.filter : this.buildFilter(options.filter)
    }
    if (options?.sort) body.sort = options.sort
    if (options?.attributesToRetrieve) body.attributesToRetrieve = options.attributesToRetrieve
    if (options?.attributesToHighlight) {
      body.attributesToHighlight = options.attributesToHighlight
    }

    const data = await this.request('POST', `/indexes/${encodeURIComponent(index)}/search`, body)

    return {
      hits: (data.hits ?? []).map(
        (hit: any): SearchHit => ({
          document: hit,
          highlights: hit._formatted,
        })
      ),
      totalHits: data.estimatedTotalHits ?? data.totalHits ?? 0,
      page,
      perPage,
      processingTimeMs: data.processingTimeMs,
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    if (this.apiKey) h['authorization'] = `Bearer ${this.apiKey}`
    return h
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new ExternalServiceError('Meilisearch', response.status, text)
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') return null
    return response.json()
  }

  private buildFilter(filter: Record<string, unknown>): string {
    return Object.entries(filter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key} IN [${value.map(v => JSON.stringify(v)).join(', ')}]`
        }
        return `${key} = ${JSON.stringify(value)}`
      })
      .join(' AND ')
  }
}
