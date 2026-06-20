import { NextResponse } from 'next/server';
import db from '@/lib/db';
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

    const existing = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId) as { id: number; username: string; role: string } | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const { role, password } = await request.json();

    // Impede remover o último admin
    if (role && role !== 'admin' && existing.role === 'admin') {
      const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Não é possível rebaixar o único administrador do sistema' }, { status: 400 });
      }
    }

    if (role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    }

    if (password && password.trim().length > 0) {
      if (password.trim().length < 6) {
        return NextResponse.json({ error: 'A senha deve ter no mínimo 6 caracteres' }, { status: 400 });
      }
      const hash = bcrypt.hashSync(password.trim(), 10);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
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

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId) as { id: number; role: string } | undefined;
    if (!target) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    // Impede deletar o último admin
    if (target.role === 'admin') {
      const adminCount = (db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as { count: number }).count;
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Não é possível excluir o único administrador do sistema' }, { status: 400 });
      }
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/users/[id] error:', err);
    return NextResponse.json({ error: 'Erro ao excluir usuário' }, { status: 500 });
  }
}
