import { next } from '@vercel/functions';

// Solo protege el cotizador (página, precios, planos y fotos). El resto del sitio sigue público.
export const config = {
  matcher: ['/cotizador', '/cotizador/:path*'],
};

const limpiar = v => (v || '').normalize('NFC').trim();

function leerCredenciales(request) {
  const auth = request.headers.get('authorization') || '';
  const [tipo, codigo] = auth.split(' ');
  if (tipo !== 'Basic' || !codigo) return null;
  try {
    const bytes = Uint8Array.from(atob(codigo), c => c.charCodeAt(0));
    const texto = new TextDecoder().decode(bytes); // acepta tildes y ñ
    const i = texto.indexOf(':');
    return { usuario: texto.slice(0, i), clave: texto.slice(i + 1) };
  } catch (e) {
    return null;
  }
}

export default function middleware(request) {
  const usuarioOk = limpiar(process.env.COTIZADOR_USUARIO);
  const claveOk = limpiar(process.env.COTIZADOR_CLAVE);

  // Si Vercel no está leyendo las variables, lo dice claramente en vez de pedir clave.
  if (!usuarioOk || !claveOk) {
    return new Response(
      'Falta configurar COTIZADOR_USUARIO y COTIZADOR_CLAVE en Vercel (Production) y hacer Redeploy.',
      { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  const c = leerCredenciales(request);
  // El usuario no distingue mayúsculas (el iPhone suele poner la primera en mayúscula).
  if (c && limpiar(c.usuario).toLowerCase() === usuarioOk.toLowerCase() && limpiar(c.clave) === claveOk) {
    return next();
  }

  return new Response('Acceso solo para asesores de La Vuelta. Recarga la página para intentar de nuevo.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Cotizador La Vuelta", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
