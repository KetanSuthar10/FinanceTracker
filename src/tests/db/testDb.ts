/**
 * Runs the real migrations in PGlite (Postgres compiled to WebAssembly) with a small
 * stand-in for the pieces Supabase provides: the auth schema, auth.uid(), and the
 * anon / authenticated roles. Queries run as a chosen user with row-level security on,
 * exactly like requests from the app.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const MIGRATIONS_DIR = join(import.meta.dirname, '../../../supabase/migrations');

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

export interface TestDb {
  db: PGlite;
  createUser: (email: string) => Promise<string>;
  /** Runs `fn` inside a transaction as the given user (role authenticated, RLS enforced). */
  asUser: <T>(userId: string, fn: (tx: Transaction) => Promise<T>) => Promise<T>;
  /** Runs `fn` inside a transaction as a signed-out visitor (role anon). */
  asAnon: <T>(fn: (tx: Transaction) => Promise<T>) => Promise<T>;
}

export async function createTestDb(): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
  }

  return {
    db,
    async createUser(email) {
      const { rows } = await db.query<{ id: string }>(
        'insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id',
        [email],
      );
      return rows[0]!.id;
    },
    asUser(userId, fn) {
      return db.transaction(async (tx) => {
        await tx.exec('set local role authenticated');
        await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
        return fn(tx);
      });
    },
    asAnon(fn) {
      return db.transaction(async (tx) => {
        await tx.exec('set local role anon');
        return fn(tx);
      });
    },
  };
}
