/**
 * Wrapper log mọi import script. Yêu cầu Chủ tịch: mỗi lần chạy import phải có log.
 *
 * Usage trong script:
 *   import { runWithImportLog } from "@/lib/import-log";
 *   await runWithImportLog({
 *     scriptName: "import-accounting-journal",
 *     sourceFile: "SO SACH BRE 2025.xlsx",
 *     targetTable: "accounting_journal",
 *   }, async (log) => {
 *     // ... do work ...
 *     log.created += 100;
 *     log.skipped += 5;
 *     log.details = { affected_ids: [...] };
 *   });
 */
import postgres from "postgres";
import path from "path";
import os from "os";

interface LogState {
  created: number;
  updated: number;
  skipped: number;
  errored: number;
  details: Record<string, any>;
}

interface Options {
  scriptName: string;
  sourceFile?: string;
  targetTable?: string;
  runBy?: string;
  connectionString?: string;
}

export async function runWithImportLog(
  opts: Options,
  fn: (log: LogState) => Promise<void>,
): Promise<void> {
  const sql = postgres(opts.connectionString ?? process.env.DATABASE_URL!);
  const sourceBase = opts.sourceFile ? path.basename(opts.sourceFile) : null;
  const runBy = opts.runBy ?? process.env.USER ?? os.userInfo().username ?? "unknown";

  // Insert running row
  const [row] = await sql`
    INSERT INTO import_logs (script_name, source_file, target_table, run_by, status)
    VALUES (${opts.scriptName}, ${sourceBase}, ${opts.targetTable ?? null}, ${runBy}, 'running')
    RETURNING id, started_at
  `;
  const logId = Number(row.id);
  const startedAt = row.started_at;
  console.log(`📝 [import-log #${logId}] ${opts.scriptName} started at ${startedAt} by ${runBy}`);

  const state: LogState = { created: 0, updated: 0, skipped: 0, errored: 0, details: {} };
  try {
    await fn(state);
    await sql`
      UPDATE import_logs SET
        finished_at = now(),
        status = 'success',
        records_created = ${state.created},
        records_updated = ${state.updated},
        records_skipped = ${state.skipped},
        records_error = ${state.errored},
        details = ${sql.json(state.details)}
      WHERE id = ${logId}`;
    console.log(`✅ [import-log #${logId}] SUCCESS — created=${state.created} updated=${state.updated} skipped=${state.skipped} errored=${state.errored}`);
  } catch (e: any) {
    await sql`
      UPDATE import_logs SET
        finished_at = now(),
        status = 'failed',
        records_created = ${state.created},
        records_updated = ${state.updated},
        records_skipped = ${state.skipped},
        records_error = ${state.errored},
        error_message = ${String(e?.message ?? e).slice(0, 500)},
        details = ${sql.json(state.details)}
      WHERE id = ${logId}`;
    console.error(`❌ [import-log #${logId}] FAILED:`, e);
    throw e;
  } finally {
    await sql.end();
  }
}
