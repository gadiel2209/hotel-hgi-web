// Sesiones en memoria del servidor: token aleatorio en una cookie HttpOnly.
// Al cerrar sesión el token se destruye de inmediato. Si reinicias el servidor, hay que volver a entrar.
import crypto from 'node:crypto';
import { ObjectId } from 'mongodb';
import { config } from './config.js';
import { getDb } from './db.js';

export const COOKIE = 'hgi_sesion';
const sesiones = new Map(); // token -> { usuarioId, expira }

export function crearSesion(usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  sesiones.set(token, { usuarioId: usuarioId.toHexString(), expira: Date.now() + config.sesionHoras * 3600000 });
  return token;
}

export function destruirSesion(token) {
  if (token) sesiones.delete(token);
}

const atributos = () => `HttpOnly; SameSite=Lax; Path=/${config.produccion ? '; Secure' : ''}`;
export const cookieSesion = token => `${COOKIE}=${token}; Max-Age=${config.sesionHoras * 3600}; ${atributos()}`;
export const cookieBorrar = () => `${COOKIE}=; Max-Age=0; ${atributos()}`;

export function leerCookies(req) {
  const salida = {};
  for (const parte of (req.headers.cookie || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0) salida[parte.slice(0, i).trim()] = decodeURIComponent(parte.slice(i + 1).trim());
  }
  return salida;
}

export function leerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return leerCookies(req)[COOKIE] || null;
}

// Devuelve { token, usuario } si la sesión es válida; si no, null
export async function usuarioDeSesion(req) {
  const token = leerToken(req);
  const s = token && sesiones.get(token);
  if (!s) return null;
  if (s.expira < Date.now()) { sesiones.delete(token); return null; }
  const usuario = await getDb().collection('usuarios').findOne(
    { _id: new ObjectId(s.usuarioId) },
    { projection: { password_hash: 0 } }
  );
  const bloqueado = usuario?.bloqueado_hasta && usuario.bloqueado_hasta > new Date();
  if (!usuario || !usuario.activo || bloqueado) { sesiones.delete(token); return null; }
  return { token, usuario };
}

// Limpia sesiones vencidas cada 10 minutos
setInterval(() => {
  const ahora = Date.now();
  for (const [t, s] of sesiones) if (s.expira < ahora) sesiones.delete(t);
}, 600000).unref();
