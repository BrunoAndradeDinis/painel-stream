import { NextResponse } from 'next/server';
import db from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { id, name, status, current_channel } = await request.json();

    if (!id || !name) {
      return NextResponse.json({ error: 'ID e Nome da VM são obrigatórios' }, { status: 400 });
    }

    // Upsert the VM data
    const existing = db.prepare('SELECT id FROM vms WHERE id = ?').get(id);

    if (existing) {
      db.prepare(`
        UPDATE vms 
        SET name = ?, status = ?, current_channel = ?, last_ping = CURRENT_TIMESTAMP 
        WHERE id = ?
      `).run(name, status || 'online', current_channel || null, id);
    } else {
      db.prepare(`
        INSERT INTO vms (id, name, status, current_channel) 
        VALUES (?, ?, ?, ?)
      `).run(id, name, status || 'online', current_channel || null);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Heartbeat Error:', err);
    return NextResponse.json({ error: 'Erro ao registrar heartbeat' }, { status: 500 });
  }
}
