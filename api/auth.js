// APIs de autenticación: login, logout y sesión actual.
// Cada función devuelve { status, datos, cookie? } y server.js la envía.
import bcrypt from 'bcryptjs';
import { config } from '../lib/config.js';
import { getDb } from '../lib/db.js';
import { registrarEvento } from '../lib/auditoria.js';
import { crearSesion, destruirSesion, cookieSesion, cookieBorrar, usuarioDeSesion } from '../lib/sesion.js';

const MSG_INCORRECTO = 'Usuario o contraseña incorrectos';
const PATRON_USUARIO = /^[a-z0-9._]{3,30}$/; // mismo patrón que el $jsonSchema de usuarios
// Si el usuario no existe igual se ejecuta bcrypt, así el tiempo de respuesta no revela qué usuarios existen
const HASH_RELLENO = bcrypt.hashSync('relleno-para-tiempo-constante', 10);
const hora = f => f.toLocaleTimeString('es-MX', { timeZone: config.zonaHoraria, hour: '2-digit', minute: '2-digit' });

export const datosPublicos = u => ({
  id: u._id, usuario: u.usuario, nombre: u.nombre, puesto: u.puesto || null,
  rol: u.rol, correo: u.correo || null, ultimo_acceso: u.ultimo_acceso || null
});

// Límite por IP: máximo 20 intentos cada 15 minutos (contra fuerza bruta)
const intentosPorIp = new Map();
function excedeLimite(ip) {
  const ahora = Date.now();
  const r = intentosPorIp.get(ip) || { n: 0, desde: ahora };
  if (ahora - r.desde > 15 * 60000) { r.n = 0; r.desde = ahora; }
  r.n += 1;
  intentosPorIp.set(ip, r);
  return r.n > 20;
}

// POST /api/auth/login
export async function login(req, body, ip) {
  if (excedeLimite(ip)) {
    return { status: 429, datos: { error: 'Demasiados intentos desde este equipo. Espera unos minutos.', codigo: 'DEMASIADOS_INTENTOS' } };
  }
  const db = getDb();
  const usuarios = db.collection('usuarios');
  const ahora = new Date();
  const usuarioTxt = typeof body?.usuario === 'string' ? body.usuario.trim().toLowerCase() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!usuarioTxt || !password) return { status: 400, datos: { error: 'Escribe tu usuario y tu contraseña', codigo: 'VACIO' } };

  const registrarFallo = (u, motivo, extra = {}) => registrarEvento(db, {
    evento: 'inicio_sesion_fallido', resultado: 'fallo', usuario: u || undefined,
    usuarioIntentado: usuarioTxt, ip, recurso: 'auth/login', detalle: { motivo, ...extra }
  });

  // 1) Usuario inexistente o con formato inválido
  const u = PATRON_USUARIO.test(usuarioTxt) && password.length <= 72 ? await usuarios.findOne({ usuario: usuarioTxt }) : null;
  if (!u) {
    await bcrypt.compare(password.slice(0, 72), HASH_RELLENO);
    await registrarFallo(null, 'usuario_inexistente');
    return { status: 401, datos: { error: MSG_INCORRECTO, codigo: 'CREDENCIALES' } };
  }

  // 2) Cuenta bloqueada temporalmente
  if (u.bloqueado_hasta && u.bloqueado_hasta > ahora) {
    await usuarios.updateOne({ _id: u._id }, { $inc: { intentos_fallidos: 1 } });
    await registrarFallo(u, 'cuenta_bloqueada', { bloqueado_hasta: u.bloqueado_hasta });
    return { status: 423, datos: { error: `Cuenta bloqueada por intentos fallidos. Intenta de nuevo después de las ${hora(u.bloqueado_hasta)}.`, codigo: 'CUENTA_BLOQUEADA' } };
  }
  if (u.bloqueado_hasta && u.bloqueado_hasta <= ahora) {
    // El bloqueo ya venció: el contador empieza de nuevo
    await usuarios.updateOne({ _id: u._id }, { $set: { intentos_fallidos: 0, bloqueado_hasta: null } });
  }

  // 3) Contraseña incorrecta
  let valida = false;
  try { valida = await bcrypt.compare(password, u.password_hash); } catch { valida = false; }
  if (!valida) {
    const act = await usuarios.findOneAndUpdate({ _id: u._id }, { $inc: { intentos_fallidos: 1 } },
      { returnDocument: 'after', projection: { intentos_fallidos: 1 } });
    const intentos = act?.intentos_fallidos ?? 1;
    let bloqueadoHasta = null;
    if (intentos >= config.maxIntentos) {
      bloqueadoHasta = new Date(ahora.getTime() + config.minutosBloqueo * 60000);
      await usuarios.updateOne({ _id: u._id }, { $set: { bloqueado_hasta: bloqueadoHasta } });
    }
    await registrarFallo(u, 'contrasena_incorrecta', { intentos_fallidos: intentos, ...(bloqueadoHasta ? { bloqueo_aplicado_hasta: bloqueadoHasta } : {}) });
    if (bloqueadoHasta) {
      return { status: 423, datos: { error: `${MSG_INCORRECTO}. Por seguridad, la cuenta quedó bloqueada ${config.minutosBloqueo} minutos.`, codigo: 'CUENTA_BLOQUEADA' } };
    }
    return { status: 401, datos: { error: MSG_INCORRECTO, codigo: 'CREDENCIALES' } };
  }

  // 4) Cuenta desactivada (solo se informa si la contraseña era correcta)
  if (!u.activo) {
    await usuarios.updateOne({ _id: u._id }, { $inc: { intentos_fallidos: 1 } });
    await registrarFallo(u, 'cuenta_inactiva');
    return { status: 403, datos: { error: 'Tu cuenta está desactivada. Contacta a Administración.', codigo: 'CUENTA_INACTIVA' } };
  }

  // 5) Éxito
  await usuarios.updateOne({ _id: u._id }, { $set: { ultimo_acceso: ahora, intentos_fallidos: 0, bloqueado_hasta: null } });
  await registrarEvento(db, {
    evento: 'inicio_sesion', resultado: 'exito', usuario: u, ip, recurso: 'auth/login',
    detalle: { user_agent: String(req.headers['user-agent'] || '').slice(0, 200) }
  });
  const token = crearSesion(u._id);
  return {
    status: 200,
    cookie: cookieSesion(token),
    datos: { token, usuario: datosPublicos({ ...u, ultimo_acceso: ahora }), acceso_anterior: u.ultimo_acceso || null }
  };
}

// POST /api/auth/logout
export async function logout(req, ip) {
  const sesion = await usuarioDeSesion(req);
  if (sesion) {
    await registrarEvento(getDb(), { evento: 'cierre_sesion', resultado: 'exito', usuario: sesion.usuario, ip, recurso: 'auth/logout' });
    destruirSesion(sesion.token);
  }
  return { status: 200, cookie: cookieBorrar(), datos: { ok: true } };
}

// GET /api/auth/me
export async function yo(req) {
  const sesion = await usuarioDeSesion(req);
  if (!sesion) return { status: 401, cookie: cookieBorrar(), datos: { error: 'No has iniciado sesión' } };
  return { status: 200, datos: { usuario: datosPublicos(sesion.usuario) } };
}
