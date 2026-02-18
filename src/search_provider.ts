import { ServiceProvider } from '@stravigor/kernel'
import type { Application } from '@stravigor/kernel'
import SearchManager from './search_manager.ts'

export default class SearchProvider extends ServiceProvider {
  readonly name = 'search'
  override readonly dependencies = ['config']

  override register(app: Application): void {
    app.singleton(SearchManager)
  }

  override boot(app: Application): void {
    app.resolve(SearchManager)
  }
}
