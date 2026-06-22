import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('[db] DATABASE_URL is not set. Add it to .env or Vercel environment variables.');
}

/**
 * Tagged-template SQL client for Neon serverless PostgreSQL.
 * Usage: await sql`SELECT * FROM users WHERE id = ${id}`
 */
const sql = neon(process.env.DATABASE_URL);

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export default sql;
