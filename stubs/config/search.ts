import { env } from '@stravigor/kernel'

export default {
  /** The default search driver to use. */
  default: env('SEARCH_DRIVER', 'meilisearch'),

  /** Index name prefix (useful for multi-tenant or multi-environment). */
  prefix: env('SEARCH_PREFIX', ''),

  drivers: {
    meilisearch: {
      driver: 'meilisearch',
      host: env('MEILISEARCH_HOST', 'localhost'),
      port: env('MEILISEARCH_PORT', '7700').int(),
      apiKey: env('MEILISEARCH_KEY', ''),
    },

    typesense: {
      driver: 'typesense',
      host: env('TYPESENSE_HOST', 'localhost'),
      port: env('TYPESENSE_PORT', '8108').int(),
      apiKey: env('TYPESENSE_KEY', ''),
      protocol: 'http',
    },

    algolia: {
      driver: 'algolia',
      appId: env('ALGOLIA_APP_ID', ''),
      apiKey: env('ALGOLIA_SECRET', ''),
    },
  },
}
