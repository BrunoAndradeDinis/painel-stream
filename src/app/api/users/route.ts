import { NextResponse } from 'next/server';
import sql, { User } from '@/lib/db';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';

export async function GET() {
  try {
    const users = await sql`
      SELECT id, username, role, created_at FROM users ORDER BY created_at ASC
    ` as Pick<User, 'id' | 'username' | 'role' | 'created_at'>[];
    return NextResponse.json({ users });
  } catch (err: unknown) {
    console.error('GET /api/users error:', err);
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

    const hash = await bcrypt.hash(password, 10);

    const rows = await sql`
      INSERT INTO users (username, password_hash, role)
      VALUES (${username}, ${hash}, ${role})
      RETURNING id
    ` as { id: number }[];
    const newUser = rows[0];

    return NextResponse.json({ success: true, id: newUser.id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'Usuário já existe' }, { status: 400 });
    }
    console.error('POST /api/users error:', err);
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 });
  }
}
