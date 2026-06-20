import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'users.db');
const db = new Database(dbPath);

// Criação da tabela caso não exista
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'uploader',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    current_channel TEXT,
    last_ping DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Verifica se a tabela está vazia, e cria o Admin padrão
const countRow = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (countRow.count === 0) {
  const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const defaultUsername = process.env.ADMIN_USERNAME || 'admin';
  const hash = bcrypt.hashSync(defaultPassword, 10);
  
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(defaultUsername, hash, 'admin');
  console.log(`[DB] Usuário padrão criado: ${defaultUsername} / ${defaultPassword}`);
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export default db;
