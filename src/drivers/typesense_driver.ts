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
 * Typesense driver — communicates with the Typesense REST API via raw `fetch()`.
 *
 * @see https://typesense.org/docs/api/
 */
export class TypesenseDriver implements SearchEngine {
  readonly name = 'typesense'
  private baseUrl: string
  private apiKey: string

  constructor(config: DriverConfig) {
    const protocol = config.protocol ?? 'http'
    const host = config.host ?? 'localhost'
    const port = config.port ?? 8108
    this.baseUrl = `${protocol}://${host}:${port}`
    this.apiKey = (config.apiKey as string) ?? ''
  }

  // ── Interface ────────────────────────────────────────────────────────────

  async upsert(
    index: string,
    id: string | number,
    document: Record<string, unknown>
  ): Promise<void> {
    await this.request(
      'POST',
      `/collections/${encodeURIComponent(index)}/documents?action=upsert`,
      { id: String(id), ...document }
    )
  }

  async upsertMany(index: string, documents: SearchDocument[]): Promise<void> {
    const jsonl = documents.map(doc => JSON.stringify({ ...doc, id: String(doc.id) })).join('\n')
    await this.rawRequest(
      'POST',
      `/collections/${encodeURIComponent(index)}/documents/import?action=upsert`,
      jsonl,
      'text/plain'
    )
  }

  async delete(index: string, id: string | number): Promise<void> {
    await this.request(
      'DELETE',
      `/collections/${encodeURIComponent(index)}/documents/${encodeURIComponent(String(id))}`
    )
  }

  async deleteMany(index: string, ids: Array<string | number>): Promise<void> {
    const filter = `id:[${ids.map(id => String(id)).join(',')}]`
    await this.request(
      'DELETE',
      `/collections/${encodeURIComponent(index)}/documents?filter_by=${encodeURIComponent(filter)}`
    )
  }

  async flush(index: string): Promise<void> {
    // Typesense has no "delete all documents" endpoint — delete the collection and recreate it.
    // We fetch the current schema first so we can recreate it.
    let schema: any
    try {
      schema = await this.request('GET', `/collections/${encodeURIComponent(index)}`)
    } catch {
      // Collection doesn't exist — nothing to flush
      return
    }
    await this.request('DELETE', `/collections/${encodeURIComponent(index)}`)
    await this.request('POST', '/collections', {
      name: schema.name,
      fields: schema.fields,
    })
  }

  async deleteIndex(index: string): Promise<void> {
    await this.request('DELETE', `/collections/${encodeURIComponent(index)}`)
  }

  async createIndex(index: string, options?: IndexSettings): Promise<void> {
    const fields: Record<string, unknown>[] = []

    if (options?.searchableAttributes) {
      for (const attr of options.searchableAttributes) {
        fields.push({ name: attr, type: 'string', facet: false })
      }
    }
    if (options?.filterableAttributes) {
      for (const attr of options.filterableAttributes) {
        if (!fields.some(f => f.name === attr)) {
          fields.push({ name: attr, type: 'string', facet: true })
        }
      }
    }
    if (options?.sortableAttributes) {
      for (const attr of options.sortableAttributes) {
        if (!fields.some(f => f.name === attr)) {
          fields.push({ name: attr, type: 'string', sort: true })
        }
      }
    }

    // Always include a wildcard field so untyped fields are auto-detected
    if (fields.length === 0) {
      fields.push({ name: '.*', type: 'auto' })
    }

    await this.request('POST', '/collections', {
      name: index,
      fields,
    })
  }

  async search(index: string, query: string, options?: SearchOptions): Promise<SearchResult> {
    const perPage = options?.perPage ?? 20
    const page = options?.page ?? 1

    const params = new URLSearchParams({
      q: query,
      query_by: '*',
      per_page: String(perPage),
      page: String(page),
    })

    if (options?.filter) {
      params.set(
        'filter_by',
        typeof options.filter === 'string' ? options.filter : this.buildFilter(options.filter)
      )
    }
    if (options?.sort) {
      params.set('sort_by', options.sort.map(s => s.replace(':', ':')).join(','))
    }
    if (options?.attributesToRetrieve) {
      params.set('include_fields', options.attributesToRetrieve.join(','))
    }
    if (options?.attributesToHighlight) {
      params.set('highlight_fields', options.attributesToHighlight.join(','))
    }

    const data = await this.request(
      'GET',
      `/collections/${encodeURIComponent(index)}/documents/search?${params.toString()}`
    )

    return {
      hits: (data.hits ?? []).map(
        (hit: any): SearchHit => ({
          document: hit.document,
          highlights: hit.highlights?.reduce(
            (acc: Record<string, string>, h: any) => {
              if (h.field && h.snippet) acc[h.field] = h.snippet
              return acc
            },
            {} as Record<string, string>
          ),
        })
      ),
      totalHits: data.found ?? 0,
      page,
      perPage,
      processingTimeMs: data.search_time_ms,
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      'x-typesense-api-key': this.apiKey,
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
      throw new ExternalServiceError('Typesense', response.status, text)
    }

    if (response.status === 204 || response.headers.get('content-length') === '0') return null
    return response.json()
  }

  private async rawRequest(
    method: string,
    path: string,
    body: string,
    contentType: string
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { 'content-type': contentType, 'x-typesense-api-key': this.apiKey },
      body,
    })

    if (!response.ok) {
      const text = await response.text()
      throw new ExternalServiceError('Typesense', response.status, text)
    }
  }

  private buildFilter(filter: Record<string, unknown>): string {
    return Object.entries(filter)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:[${value.map(v => String(v)).join(',')}]`
        }
        return `${key}:=${value}`
      })
      .join(' && ')
  }
}
