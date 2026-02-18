import SearchManager from '../src/search_manager.ts'
import type { SearchEngine } from '../src/search_engine.ts'
import type { SearchDocument, SearchOptions, SearchResult, IndexSettings } from '../src/types.ts'

// ---------------------------------------------------------------------------
// Mock fetch (same pattern as @stravigor/brain tests)
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch

export interface FetchCall {
  url: string
  init: RequestInit
}

export function mockFetch(response: any, status = 200) {
  const calls: FetchCall[] = []

  globalThis.fetch = async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    const body = typeof response === 'string' ? response : JSON.stringify(response)
    return new Response(body, {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  return calls
}

export function restoreFetch() {
  globalThis.fetch = originalFetch
}

export function lastFetchCall(calls: FetchCall[]): FetchCall {
  return calls[calls.length - 1]
}

export function fetchBody(call: FetchCall): any {
  return JSON.parse(call.init.body as string)
}

// ---------------------------------------------------------------------------
// Mock Configuration
// ---------------------------------------------------------------------------

export function mockConfig(overrides: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    search: {
      default: 'meilisearch',
      prefix: '',
      drivers: {
        meilisearch: {
          driver: 'meilisearch',
          host: 'localhost',
          port: 7700,
          apiKey: 'test-key',
        },
        typesense: {
          driver: 'typesense',
          host: 'localhost',
          port: 8108,
          apiKey: 'test-key',
          protocol: 'http',
        },
        algolia: {
          driver: 'algolia',
          appId: 'test-app',
          apiKey: 'test-key',
        },
        null: {
          driver: 'null',
        },
      },
      ...overrides,
    },
  }

  return {
    get(key: string, defaultValue?: unknown): unknown {
      const parts = key.split('.')
      let current: any = data
      for (const part of parts) {
        if (current === undefined || current === null) return defaultValue
        current = current[part]
      }
      return current !== undefined ? current : defaultValue
    },
    has(key: string): boolean {
      return this.get(key) !== undefined
    },
  } as any
}

// ---------------------------------------------------------------------------
// Bootstrap SearchManager with mocks
// ---------------------------------------------------------------------------

export function bootSearch(overrides: Record<string, unknown> = {}) {
  const config = mockConfig(overrides)
  SearchManager.reset()
  new SearchManager(config)
  return { config }
}

// ---------------------------------------------------------------------------
// Recording engine (captures calls for assertions)
// ---------------------------------------------------------------------------

export interface EngineCall {
  method: string
  args: unknown[]
}

export function recordingEngine(driverName: string = 'recording'): {
  engine: SearchEngine
  calls: EngineCall[]
} {
  const calls: EngineCall[] = []

  const engine: SearchEngine = {
    name: driverName,
    async upsert(...args: any[]) {
      calls.push({ method: 'upsert', args })
    },
    async upsertMany(...args: any[]) {
      calls.push({ method: 'upsertMany', args })
    },
    async delete(...args: any[]) {
      calls.push({ method: 'delete', args })
    },
    async deleteMany(...args: any[]) {
      calls.push({ method: 'deleteMany', args })
    },
    async flush(...args: any[]) {
      calls.push({ method: 'flush', args })
    },
    async deleteIndex(...args: any[]) {
      calls.push({ method: 'deleteIndex', args })
    },
    async createIndex(...args: any[]) {
      calls.push({ method: 'createIndex', args })
    },
    async search(...args: any[]): Promise<SearchResult> {
      calls.push({ method: 'search', args })
      return { hits: [], totalHits: 0, page: 1, perPage: 20 }
    },
  }

  return { engine, calls }
}
