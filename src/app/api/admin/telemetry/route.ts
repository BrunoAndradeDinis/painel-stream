import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Um caminho temporário no disco da VM para armazenar o status das máquinas
// Num ambiente de produção multiserver, usaríamos Redis. Mas para uma VM única, arquivo/memória resolve.
const TELEMETRY_FILE = path.join(process.cwd(), '.telemetry.json');

function readTelemetry() {
  try {
    if (fs.existsSync(TELEMETRY_FILE)) {
      return JSON.parse(fs.readFileSync(TELEMETRY_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Error reading telemetry file', e);
  }
  return {};
}

function writeTelemetry(data: any) {
  try {
    fs.writeFileSync(TELEMETRY_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error writing telemetry file', e);
  }
}

export async function GET() {
  const data = readTelemetry();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { vmId, channel, status, logs } = body;

    if (!vmId) {
      return NextResponse.json({ error: 'Missing vmId' }, { status: 400 });
    }

    const data = readTelemetry();

    // Atualiza os dados dessa VM específica
    data[vmId] = {
      vmId,
      channel: channel || 'unknown',
      status: status || 'online',
      lastSeen: new Date().toISOString(),
      logs: logs || [], // array de strings (as últimas linhas do console do ffmpeg/server)
    };

    writeTelemetry(data);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error in telemetry POST', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
