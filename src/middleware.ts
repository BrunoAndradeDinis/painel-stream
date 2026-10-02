import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'a-very-secret-default-key-for-development'
);

// Rotas públicas que não precisam de autenticação
const publicPaths = ['/login', '/api/auth/login'];

// Rotas de máquina para máquina (AuraStream <-> Painel) que exigem API Key
const machinePaths = ['/api/vms/heartbeat', '/api/admin/telemetry'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Verifica se é uma rota de máquina (exige API Key)
  if (machinePaths.includes(pathname)) {
    const apiKey = request.headers.get('x-api-key');
    const validKey = process.env.INTERNAL_API_KEY;
    
    if (!apiKey || apiKey !== validKey) {
      return NextResponse.json({ error: 'Acesso negado (API Key inválida)' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Verifica se é uma rota pública ou um arquivo estático (_next, favicon, etc)
  if (
    publicPaths.includes(pathname) ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('painel_session')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    // Podemos anexar o role/user no header se precisarmos consumir na API, 
    // mas o Next.js App Router também permite ler cookies diretamente na API.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.sub as string);
    requestHeaders.set('x-user-role', payload.role as string);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch (err) {
    // Token inválido ou expirado — redireciona para o login
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Sessão expirada' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    // Apaga o cookie expirado na resposta para forçar o browser a removê-lo
    redirectResponse.cookies.set({
      name: 'painel_session',
      value: '',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    return redirectResponse;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
