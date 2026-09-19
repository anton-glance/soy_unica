import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Round 6 caught this the hard way: `files` has no column named `created_by`
 * (it's `uploaded_by`), and that typo shipped to the remote database because
 * nothing had ever actually run the generated `.sql`.
 *
 * So before either importer will write its `.sql`, it builds a throwaway
 * local D1 database from the real migrations and executes the generated SQL
 * against it. Any statement erroring here — a bad column name, a bad type, a
 * constraint the schema actually enforces — fails the whole run loudly and
 * nothing is written. This is disposable state, wiped after: it proves
 * nothing about your real `.wrangler/state`, and touches no remote database.
 */
export function verifyAgainstMigratedDatabase(sqlText) {
  const persistTo = mkdtempSync(join(tmpdir(), 'soy-unica-sql-verify-'))
  try {
    const migrate = spawnSync(
      'npx',
      ['wrangler', 'd1', 'migrations', 'apply', 'soy-unica', '--local', '--persist-to', persistTo],
      { encoding: 'utf8', env: { ...process.env, CI: '1' } },
    )
    if (migrate.status !== 0) {
      throw new Error(
        `could not build a throwaway database from db/migrations to verify against:\n${migrate.stdout}\n${migrate.stderr}`,
      )
    }
    const sqlPath = join(persistTo, 'verify.sql')
    writeFileSync(sqlPath, sqlText)
    const apply = spawnSync(
      'npx',
      ['wrangler', 'd1', 'execute', 'soy-unica', '--local', '--persist-to', persistTo, '--file', sqlPath, '-y'],
      { encoding: 'utf8' },
    )
    if (apply.status !== 0) {
      throw new Error(`generated SQL does not apply to a freshly migrated database:\n${apply.stdout}\n${apply.stderr}`)
    }
  } finally {
    rmSync(persistTo, { recursive: true, force: true })
  }
}
