import type { Command } from 'commander'
import chalk from 'chalk'
import { bootstrap, shutdown } from '@stravigor/cli'
import { BaseModel } from '@stravigor/database'
import SearchManager from '../search_manager.ts'

export function register(program: Command): void {
  program
    .command('search:import <model>')
    .description('Import all records for a model into the search index')
    .option('--chunk <size>', 'Records per batch', '500')
    .action(async (modelPath: string, options: { chunk: string }) => {
      let db
      try {
        const { db: database, config } = await bootstrap()
        db = database

        new BaseModel(db)
        new SearchManager(config)

        const resolved = require.resolve(`${process.cwd()}/${modelPath}`)
        const module = await import(resolved)
        const ModelClass = module.default ?? (Object.values(module)[0] as any)

        if (typeof ModelClass?.importAll !== 'function') {
          console.error(chalk.red(`Model "${modelPath}" does not use the searchable() mixin.`))
          process.exit(1)
        }

        const chunkSize = parseInt(options.chunk, 10)
        const indexName = ModelClass.searchableAs()
        console.log(chalk.dim(`Importing ${ModelClass.name} into "${indexName}"...`))

        const count = await ModelClass.importAll(chunkSize)
        console.log(chalk.green(`Imported ${count} record(s) into "${indexName}".`))
      } catch (err) {
        console.error(chalk.red(`Error: ${err instanceof Error ? err.message : err}`))
        process.exit(1)
      } finally {
        if (db) await shutdown(db)
      }
    })
}
