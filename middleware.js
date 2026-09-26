import { next } from '@vercel/functions';

// Solo protege el cotizador (página, precios, planos y fotos). El resto del sitio sigue público.
export const config = {
  matcher: ['/cotizador', '/cotizador/:path*'],
};

export default function middleware(request) {
  const auth = request.headers.get('authorization') || '';
  const [tipo, codigo] = auth.split(' ');

  if (tipo === 'Basic' && codigo) {
    const texto = atob(codigo);
    const i = texto.indexOf(':');
    const usuario = texto.slice(0, i);
    const clave = texto.slice(i + 1);
    if (usuario === process.env.COTIZADOR_USUARIO && clave === process.env.COTIZADOR_CLAVE) {
      return next();
    }
  }

  return new Response('Acceso solo para asesores de La Vuelta.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Cotizador La Vuelta", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
