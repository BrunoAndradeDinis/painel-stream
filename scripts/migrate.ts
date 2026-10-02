/**
 * scripts/migrate.ts
 * Executa uma única vez para criar as tabelas no Neon PostgreSQL.
 * Uso: npx ts-node scripts/migrate.ts
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

async function migrate() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set in environment variables.');
  }

  const sql = neon(process.env.DATABASE_URL);

  console.log('[migrate] Connecting to Neon...');

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id        SERIAL PRIMARY KEY,
      username  TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role      TEXT NOT NULL DEFAULT 'uploader',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('[migrate] ✅ Table "users" ready.');

  await sql`
    CREATE TABLE IF NOT EXISTS vms (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'offline',
      current_channel TEXT,
      last_ping       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log('[migrate] ✅ Table "vms" ready.');

  // Seed: cria o admin padrão se a tabela estiver vazia
  const [{ count }] = await sql`SELECT COUNT(*) as count FROM users` as { count: string }[];
  if (Number(count) === 0) {
    const bcrypt = await import('bcryptjs');
    const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    await sql`INSERT INTO users (username, password_hash, role) VALUES (${defaultUsername}, ${hash}, 'admin')`;
    console.log(`[migrate] ✅ Default admin created: ${defaultUsername}`);
  } else {
    console.log(`[migrate] ℹ️  Skipped seed — ${count} user(s) already exist.`);
  }

  console.log('[migrate] 🎉 Done.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('[migrate] ❌ Error:', err);
  process.exit(1);
});
