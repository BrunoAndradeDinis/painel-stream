import { NextResponse } from 'next/server';
import sql, { User } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';
import rateLimit from '@/lib/rate-limit';

const limiter = rateLimit({
  interval: 5 * 60 * 1000, // 5 minutes
  uniqueTokenPerInterval: 500, // Max 500 users per 5 minutes
});

export async function POST(request: Request) {
  try {
    // Pegar o IP para o rate limit (fallback para username)
    const ip = request.headers.get('x-forwarded-for') ?? '127.0.0.1';
    
    try {
      await limiter.check(5, `login_${ip}`); // Max 5 tentativas por IP
    } catch {
      return NextResponse.json({ error: 'Muitas tentativas de login. Tente novamente em 5 minutos.' }, { status: 429 });
    }

    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Usuário e senha são obrigatórios' }, { status: 400 });
    }

    const rows = await sql`SELECT * FROM users WHERE username = ${username} LIMIT 1` as User[];
    const user = rows[0];

    if (!user) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    // Sucesso no login, reseta as falhas desse IP
    limiter.reset(`login_${ip}`);

    const token = await signToken({ sub: String(user.id), role: user.role, username: user.username });

    const response = NextResponse.json({ success: true, role: user.role });
    response.cookies.set({
      name: 'painel_session',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (err: unknown) {
    console.error('Login error:', err);
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 });
  }
}
