import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import bcrypt from 'bcryptjs';
import type { NextRequest } from 'next/server';

type RouteContext = { params: Promise<{ id: string }> };

// PATCH /api/users/[id] — Atualiza role e/ou senha
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const roleHeader = request.headers.get('x-user-role');
    if (roleHeader !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem editar usuários' }, { status: 403 });
    }

    const { id } = await context.params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, username, role FROM users WHERE id = ${userId}
    ` as { id: number; username: string; role: string }[];
    const existing = rows[0];

    if (!existing) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { role, password } = await request.json();

    // Impede remover o último admin
    if (role && role !== 'admin' && existing.role === 'admin') {
      const adminRows = await sql`
        SELECT COUNT(*) as count FROM users WHERE role = 'admin'
      ` as { count: string }[];
      const adminCount = parseInt(adminRows[0].count, 10);
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Não é possível rebaixar o único administrador do sistema' }, { status: 400 });
      }
    }

    if (role) {
      await sql`UPDATE users SET role = ${role} WHERE id = ${userId}`;
    }

    if (password && password.trim().length > 0) {
      if (password.trim().length < 6) {
        return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 });
      }
      const hash = await bcrypt.hash(password.trim(), 10);
      await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${userId}`;
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('PATCH /api/users/[id] error:', err);
    return NextResponse.json({ error: 'Erro ao atualizar usuário' }, { status: 500 });
  }
}

// DELETE /api/users/[id] — Remove um usuário
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const roleHeader = request.headers.get('x-user-role');
    const currentUserId = request.headers.get('x-user-id');

    if (roleHeader !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem excluir usuários' }, { status: 403 });
    }

    const { id } = await context.params;
    const userId = parseInt(id, 10);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    // Impede deletar a si mesmo
    if (String(userId) === currentUserId) {
      return NextResponse.json({ error: 'Você não pode excluir sua própria conta' }, { status: 400 });
    }

    const rows = await sql`
      SELECT id, role FROM users WHERE id = ${userId}
    ` as { id: number; role: string }[];
    const target = rows[0];

    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Impede deletar o último admin
    if (target.role === 'admin') {
      const adminRows = await sql`
        SELECT COUNT(*) as count FROM users WHERE role = 'admin'
      ` as { count: string }[];
      const adminCount = parseInt(adminRows[0].count, 10);
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Não é possível excluir o único administrador do sistema' }, { status: 400 });
      }
    }

    await sql`DELETE FROM users WHERE id = ${userId}`;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('DELETE /api/users/[id] error:', err);
    return NextResponse.json({ error: 'Erro ao excluir usuário' }, { status: 500 });
  }
}
