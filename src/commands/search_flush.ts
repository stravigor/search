import type { Command } from 'commander'
import chalk from 'chalk'
import { bootstrap, shutdown } from '@stravigor/cli'
import { BaseModel } from '@stravigor/database'
import SearchManager from '../search_manager.ts'

export function register(program: Command): void {
  program
    .command('search:flush <model>')
    .description("Flush all documents from a model's search index")
    .action(async (modelPath: string) => {
      let db
      try {
        const { db: database, config } = await bootstrap()
        db = database

        new BaseModel(db)
        new SearchManager(config)

        const resolved = require.resolve(`${process.cwd()}/${modelPath}`)
        const module = await import(resolved)
        const ModelClass = module.default ?? (Object.values(module)[0] as any)

        if (typeof ModelClass?.flushIndex !== 'function') {
          console.error(chalk.red(`Model "${modelPath}" does not use the searchable() mixin.`))
          process.exit(1)
        }

        const indexName = ModelClass.searchableAs()
        console.log(chalk.dim(`Flushing "${indexName}"...`))

        await ModelClass.flushIndex()
        console.log(chalk.green(`Flushed all documents from "${indexName}".`))
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`))
        process.exit(1)
      } finally {
        if (db) await shutdown(db)
      }
    })
}
