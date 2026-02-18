import { describe, test, expect, beforeEach } from 'bun:test'
import SearchManager from '../src/search_manager.ts'
import { NullDriver } from '../src/drivers/null_driver.ts'
import { MeilisearchDriver } from '../src/drivers/meilisearch_driver.ts'
import { TypesenseDriver } from '../src/drivers/typesense_driver.ts'
import { AlgoliaDriver } from '../src/drivers/algolia_driver.ts'
import { bootSearch, recordingEngine } from './helpers.ts'

describe('SearchManager', () => {
  beforeEach(() => {
    SearchManager.reset()
  })

  test('reads config and exposes it', () => {
    bootSearch()
    expect(SearchManager.config.default).toBe('meilisearch')
    expect(SearchManager.config.prefix).toBe('')
  })

  test('creates meilisearch engine from config', () => {
    bootSearch()
    const engine = SearchManager.engine('meilisearch')
    expect(engine).toBeInstanceOf(MeilisearchDriver)
    expect(engine.name).toBe('meilisearch')
  })

  test('creates typesense engine from config', () => {
    bootSearch()
    const engine = SearchManager.engine('typesense')
    expect(engine).toBeInstanceOf(TypesenseDriver)
    expect(engine.name).toBe('typesense')
  })

  test('creates algolia engine from config', () => {
    bootSearch()
    const engine = SearchManager.engine('algolia')
    expect(engine).toBeInstanceOf(AlgoliaDriver)
    expect(engine.name).toBe('algolia')
  })

  test('creates null engine from config', () => {
    bootSearch({ default: 'null' })
    const engine = SearchManager.engine('null')
    expect(engine).toBeInstanceOf(NullDriver)
  })

  test('returns default engine when no name given', () => {
    bootSearch()
    const engine = SearchManager.engine()
    expect(engine).toBeInstanceOf(MeilisearchDriver)
  })

  test('caches engine instances', () => {
    bootSearch()
    const a = SearchManager.engine('meilisearch')
    const b = SearchManager.engine('meilisearch')
    expect(a).toBe(b)
  })

  test('throws on unknown driver', () => {
    bootSearch()
    expect(() => SearchManager.engine('redis')).toThrow('not configured')
  })

  test('throws when not configured', () => {
    expect(() => SearchManager.config).toThrow('not configured')
  })

  test('applies index prefix', () => {
    bootSearch({ prefix: 'myapp_' })
    expect(SearchManager.indexName('articles')).toBe('myapp_articles')
  })

  test('no prefix by default', () => {
    bootSearch()
    expect(SearchManager.indexName('articles')).toBe('articles')
  })

  test('extend registers custom driver', () => {
    bootSearch({
      drivers: {
        custom: { driver: 'custom' },
      },
      default: 'custom',
    })

    const { engine } = recordingEngine('custom')
    SearchManager.extend('custom', () => engine)

    const resolved = SearchManager.engine('custom')
    expect(resolved.name).toBe('custom')
  })

  test('useEngine replaces an engine at runtime', () => {
    bootSearch()
    const { engine } = recordingEngine('meilisearch')
    SearchManager.useEngine(engine)

    const resolved = SearchManager.engine('meilisearch')
    expect(resolved).toBe(engine)
  })

  test('reset clears all state', () => {
    bootSearch()
    SearchManager.engine('meilisearch') // cache it
    SearchManager.reset()
    expect(() => SearchManager.config).toThrow('not configured')
  })
})
