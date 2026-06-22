import { NextRequest, NextResponse } from 'next/server';

const MGC_API_KEY = process.env.MGC_API_KEY || '';
const MGC_REGION = process.env.MGC_REGION || 'br-se1';
const MGC_BASE_URL = `https://api.magalu.cloud/${MGC_REGION}/compute/v1`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!MGC_API_KEY) {
    return NextResponse.json(
      { error: 'MGC_API_KEY não configurada.' },
      { status: 500 }
    );
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body; // 'start', 'stop', 'reboot'

    if (!['start', 'stop', 'reboot'].includes(action)) {
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    const res = await fetch(`${MGC_BASE_URL}/instances/${id}/${action}`, {
      method: 'POST',
      headers: {
        'x-api-key': MGC_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`MGC API error ${res.status}:`, errText);
      return NextResponse.json(
        { error: `Erro na API da Magalu Cloud: ${res.status}` },
        { status: res.status }
      );
    }

    // A MGC retorna 202 Accepted para essas operações assíncronas
    return NextResponse.json({ success: true, message: `Comando ${action} enviado.` });
  } catch (err: any) {
    console.error(`Erro ao executar ação na VM:`, err);
    return NextResponse.json(
      { error: 'Falha interna ao comunicar com a Magalu Cloud.' },
      { status: 500 }
    );
  }
}
