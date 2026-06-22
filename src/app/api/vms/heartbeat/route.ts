import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { id, name, status, current_channel } = await request.json();

    if (!id || !name) {
      return NextResponse.json({ error: 'ID e Nome da VM são obrigatórios' }, { status: 400 });
    }

    // Upsert the VM data
    const rows = await sql`SELECT id FROM vms WHERE id = ${id}`;
    const existing = rows[0];

    if (!existing) {
      await sql`
        INSERT INTO vms (id, name, status, current_channel)
        VALUES (${id}, ${name}, ${status}, ${current_channel || null})
      `;
    } else {
      await sql`
        UPDATE vms 
        SET name = ${name}, 
            status = ${status}, 
            current_channel = ${current_channel || null},
            last_ping = NOW()
        WHERE id = ${id}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Heartbeat Error:', err);
    return NextResponse.json({ error: 'Erro ao registrar heartbeat' }, { status: 500 });
  }
}
