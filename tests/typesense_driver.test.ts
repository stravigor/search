import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { TypesenseDriver } from '../src/drivers/typesense_driver.ts'
import { mockFetch, restoreFetch, lastFetchCall, fetchBody } from './helpers.ts'
import type { FetchCall } from './helpers.ts'

describe('TypesenseDriver', () => {
  const driver = new TypesenseDriver({
    driver: 'typesense',
    host: 'localhost',
    port: 8108,
    apiKey: 'ts-test-key',
    protocol: 'http',
  })

  let calls: FetchCall[]

  beforeEach(() => {
    calls = mockFetch({ ok: true })
  })

  afterEach(() => {
    restoreFetch()
  })

  // ── Auth ─────────────────────────────────────────────────────────────────

  test('sends X-TYPESENSE-API-KEY header', async () => {
    await driver.upsert('articles', 1, { title: 'hi' })
    const { init } = lastFetchCall(calls)
    expect((init.headers as any)['x-typesense-api-key']).toBe('ts-test-key')
  })

  // ── upsert ───────────────────────────────────────────────────────────────

  test('upsert sends POST with action=upsert', async () => {
    await driver.upsert('articles', 1, { title: 'Hello' })
    const call = lastFetchCall(calls)
    expect(call.url).toContain('/collections/articles/documents?action=upsert')
    expect(call.init.method).toBe('POST')
    expect(fetchBody(call)).toEqual({ id: '1', title: 'Hello' })
  })

  test('upsert converts id to string', async () => {
    await driver.upsert('articles', 42, { title: 'Test' })
    expect(fetchBody(lastFetchCall(calls)).id).toBe('42')
  })

  // ── delete ───────────────────────────────────────────────────────────────

  test('delete sends DELETE to /collections/{index}/documents/{id}', async () => {
    await driver.delete('articles', 42)
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:8108/collections/articles/documents/42')
    expect(call.init.method).toBe('DELETE')
  })

  // ── deleteMany ───────────────────────────────────────────────────────────

  test('deleteMany uses filter_by with ids', async () => {
    await driver.deleteMany('articles', [1, 2, 3])
    const call = lastFetchCall(calls)
    expect(call.url).toContain('filter_by=')
    expect(call.init.method).toBe('DELETE')
  })

  // ── deleteIndex ──────────────────────────────────────────────────────────

  test('deleteIndex sends DELETE to /collections/{index}', async () => {
    await driver.deleteIndex('articles')
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:8108/collections/articles')
    expect(call.init.method).toBe('DELETE')
  })

  // ── createIndex ──────────────────────────────────────────────────────────

  test('createIndex sends POST to /collections', async () => {
    await driver.createIndex('articles', {
      searchableAttributes: ['title', 'body'],
    })
    const call = lastFetchCall(calls)
    expect(call.url).toBe('http://localhost:8108/collections')
    expect(call.init.method).toBe('POST')

    const body = fetchBody(call)
    expect(body.name).toBe('articles')
    expect(body.fields.length).toBe(2)
    expect(body.fields[0].name).toBe('title')
  })

  test('createIndex uses wildcard auto field when no settings', async () => {
    await driver.createIndex('articles')
    const body = fetchBody(lastFetchCall(calls))
    expect(body.fields).toEqual([{ name: '.*', type: 'auto' }])
  })

  // ── search ───────────────────────────────────────────────────────────────

  test('search sends GET to /collections/{index}/documents/search', async () => {
    calls = mockFetch({
      hits: [{ document: { id: '1', title: 'TS Guide' }, highlights: [] }],
      found: 1,
      search_time_ms: 2,
    })

    const result = await driver.search('articles', 'typescript', { page: 1, perPage: 10 })
    const call = lastFetchCall(calls)

    expect(call.url).toContain('/collections/articles/documents/search')
    expect(call.init.method).toBe('GET')
    expect(call.url).toContain('q=typescript')
    expect(call.url).toContain('per_page=10')

    expect(result.totalHits).toBe(1)
    expect(result.hits.length).toBe(1)
    expect(result.hits[0].document.title).toBe('TS Guide')
    expect(result.processingTimeMs).toBe(2)
  })

  test('search with string filter', async () => {
    calls = mockFetch({ hits: [], found: 0 })

    await driver.search('articles', 'test', { filter: 'status:=published' })
    expect(lastFetchCall(calls).url).toContain('filter_by=status%3A%3Dpublished')
  })

  // ── Error handling ───────────────────────────────────────────────────────

  test('throws ExternalServiceError on non-ok response', async () => {
    calls = mockFetch({ message: 'Not Found' }, 404)
    await expect(driver.delete('missing', 1)).rejects.toThrow('Typesense')
  })
})
