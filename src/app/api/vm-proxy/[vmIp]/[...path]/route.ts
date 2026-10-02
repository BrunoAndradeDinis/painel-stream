import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy para chamadas HTTP ao servidor AuraStream rodando na VM.
 *
 * Por que existe isso:
 *   O painel-stream roda em HTTPS (Vercel). O browser bloqueia conexões
 *   ws:// ou http:// originadas de páginas HTTPS (Mixed Content).
 *   Este proxy resolve isso: o browser chama o Vercel (HTTPS → OK), e o
 *   servidor Next.js repassa a requisição à VM via HTTP puro
 *   (server-to-server, sem restrição de Mixed Content).
 *
 * Rota:  /api/vm-proxy/[vmIp]/[...path]
 * Exemplos:
 *   GET  /api/vm-proxy/201.23.81.155/state        → GET  http://201.23.81.155:9004/api/state
 *   POST /api/vm-proxy/201.23.81.155/command      → POST http://201.23.81.155:9004/api/command
 */

const VM_HTTP_PORT = 9004;
// Timeout de 5 segundos para chamadas à VM
const FETCH_TIMEOUT_MS = 5000;

function buildVmUrl(vmIp: string, pathSegments: string[]): string {
  const apiPath = pathSegments.join('/');
  return `http://${vmIp}:${VM_HTTP_PORT}/api/${apiPath}`;
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ vmIp: string; path: string[] }> }
) {
  const { vmIp, path: pathSegments } = await params;

  // Validação básica do IP (previne SSRF em IPs internos não esperados)
  if (!vmIp || !/^\d{1,3}(\.\d{1,3}){3}$/.test(vmIp)) {
    return NextResponse.json({ error: 'IP inválido' }, { status: 400 });
  }

  const vmUrl = buildVmUrl(vmIp, pathSegments);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const isPost = req.method === 'POST';
    const body = isPost ? await req.text() : undefined;

    const vmRes = await fetch(vmUrl, {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    const data = await vmRes.json();
    return NextResponse.json(data, { status: vmRes.status });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Timeout ao conectar com a VM. Verifique se a porta 9004 está acessível.' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { error: 'Falha ao conectar com a VM.', detail: String(err) },
      { status: 502 }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export const GET = handler;
export const POST = handler;
