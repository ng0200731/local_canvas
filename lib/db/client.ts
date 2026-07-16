import "server-only";

import { Pool, type QueryResultRow } from "pg";

import { env, isLocalPostgresConfigured, localUserId, requireLocalDatabaseUrl } from "@/lib/env";

declare global {
  // eslint-disable-next-line no-var
  var __icaPgPool: Pool | undefined;
}

function createPool(): Pool {
  return new Pool({
    connectionString: requireLocalDatabaseUrl(),
    max: 10,
  });
}

export function getPool(): Pool {
  if (!isLocalPostgresConfigured && !env.DATABASE_URL) {
    throw new Error("Local Postgres is not configured.");
  }
  if (!globalThis.__icaPgPool) {
    globalThis.__icaPgPool = createPool();
  }
  return globalThis.__icaPgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClientLike) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface PoolClientLike {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

let seedPromise: Promise<void> | null = null;

/** Ensures the fixed local profile exists. Safe to call repeatedly. */
export async function ensureLocalProfile(): Promise<string> {
  if (!seedPromise) {
    seedPromise = (async () => {
      await query(
        `INSERT INTO public.profiles (id, display_name)
         VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [localUserId, "Local Developer"],
      );
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  await seedPromise;
  return localUserId;
}
