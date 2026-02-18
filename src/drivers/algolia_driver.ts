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
 * Algolia driver — communicates with the Algolia REST API via raw `fetch()`.
 *
 * @see https://www.algolia.com/doc/rest-api/search/
 */
export class AlgoliaDriver implements SearchEngine {
  readonly name = 'algolia'
  private appId: string
  private apiKey: string
  private baseUrl: string

  constructor(config: DriverConfig) {
    this.appId = (config.appId as string) ?? ''
    this.apiKey = (config.apiKey as string) ?? ''
    this.baseUrl = `https://${this.appId}.algolia.net`
  }

  // ── Interface ────────────────────────────────────────────────────────────

  async upsert(
    index: string,
    id: string | number,
    document: Record<string, unknown>
  ): Promise<void> {
    await this.request(
      'PUT',
      `/1/indexes/${encodeURIComponent(index)}/${encodeURIComponent(String(id))}`,
      document
    )
  }

  async upsertMany(index: string, documents: SearchDocument[]): Promise<void> {
    const requests = documents.map(doc => ({
      action: 'updateObject',
      body: { objectID: String(doc.id), ...doc },
    }))
    await this.request('POST', `/1/indexes/${encodeURIComponent(index)}/batch`, { requests })
  }

  async delete(index: string, id: string | number): Promise<void> {
    await this.request(
      'DELETE',
      `/1/indexes/${encodeURIComponent(index)}/${encodeURIComponent(String(id))}`
    )
  }

  async deleteMany(index: string, ids: Array<string | number>): Promise<void> {
    const requests = ids.map(id => ({
      action: 'deleteObject',
      body: { objectID: String(id) },
    }))
    await this.request('POST', `/1/indexes/${encodeURIComponent(index)}/batch`, { requests })
  }

  async flush(index: string): Promise<void> {
    await this.request('POST', `/1/indexes/${encodeURIComponent(index)}/clear`)
  }

  async deleteIndex(index: string): Promise<void> {
    await this.request('DELETE', `/1/indexes/${encodeURIComponent(index)}`)
  }

  async createIndex(index: string, options?: IndexSettings): Promise<void> {
    // Algolia creates indexes implicitly on first write.
    // If settings are provided, configure them.
    if (options) {
      const settings: Record<string, unknown> = {}
      if (options.searchableAttributes) settings.searchableAttributes = options.searchableAttributes
      if (options.displayedAttributes) settings.attributesToRetrieve = options.displayedAttributes
      if (options.filterableAttributes) {
        settings.attributesForFaceting = options.filterableAttributes.map(
          attr => `filterOnly(${attr})`
        )
      }
      if (options.sortableAttributes) settings.ranking = options.sortableAttributes

      if (Object.keys(settings).length > 0) {
        await this.request('PUT', `/1/indexes/${encodeURIComponent(index)}/settings`, settings)
      }
    }
  }

  async search(index: string, query: string, options?: SearchOptions): Promise<SearchResult> {
    const perPage = options?.perPage ?? 20
    const page = options?.page ?? 1

    const body: Record<string, unknown> = {
      query,
      hitsPerPage: perPage,
      page: page - 1, // Algolia uses 0-based pages
    }

    if (options?.filter) {
      body.filters =
        typeof options.filter === 'string' ? options.filter : this.buildFilter(options.filter)
    }
    if (options?.attributesToRetrieve) body.attributesToRetrieve = options.attributesToRetrieve
    if (options?.attributesToHighlight) body.attributesToHighlight = options.attributesToHighlight

    const data = await this.request('POST', `/1/indexes/${encodeURIComponent(index)}/query`, body)

    return {
      hits: (data.hits ?? []).map(
        (hit: any): SearchHit => ({
          document: hit,
          highlights: hit._highlightResult
            ? Object.fromEntries(
                Object.entries(hit._highlightResult).map(([key, val]: [string, any]) => [
                  key,
                  val.value ?? '',
                ])
              )
            : undefined,
        })
      ),
      totalHits: data.nbHits ?? 0,
      page,
      perPage,
      processingTimeMs: data.processingTimeMS,
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-algolia-application-id': this.appId,
      'x-algolia-api-key': this.apiKey,
    }
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new ExternalServiceError('Algolia', response.status, text)
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') return null
    return response.json()
  }

  private buildFilter(filter: Record<string, unknown>): string {
    return Object.entries(filter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map(v => `${key}:${JSON.stringify(v)}`).join(' OR ')
        }
        return `${key}:${JSON.stringify(value)}`
      })
      .join(' AND ')
  }
}
