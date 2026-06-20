import { NextResponse } from 'next/server';
import db, { User } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { verifyToken } from '@/lib/auth';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const users = db.prepare('SELECT id, username, role, created_at FROM users').all();
    return NextResponse.json({ users });
  } catch (err: any) {
    return NextResponse.json({ error: 'Erro ao buscar usuários' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Apenas admin pode criar
    const roleHeader = request.headers.get('x-user-role');
    if (roleHeader !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem criar usuários' }, { status: 403 });
    }

    const { username, password, role } = await request.json();

    if (!username || !password || !role) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 });
    }

    const hash = bcrypt.hashSync(password, 10);

    const result = db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, role);

    return NextResponse.json({ success: true, id: result.lastInsertRowid });
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return NextResponse.json({ error: 'Usuário já existe' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 });
  }
}
