// Servidor único (Node.js puro, sin frameworks):
//   - sirve las páginas HTML/CSS/JS desde la raíz (compatible con GitHub Pages y hosting Node.js)
//   - responde las APIs /api/... conectadas a hotel_hgi en MongoDB Atlas (con soporte CORS)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { conectar, cerrar } from './lib/db.js';
import { usuarioDeSesion, cookieBorrar } from './lib/sesion.js';
import * as auth from './api/auth.js';
import { obtenerDashboard } from './api/dashboard.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp'
};
const CABECERAS_SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https:; frame-ancestors 'none'"
};

function cabecerasCors(req) {
  const origin = req.headers.origin;
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin'
  };
}

// ---------- utilidades HTTP ----------
function ipDe(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = (fwd || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '::1' ? '127.0.0.1' : ip || 'desconocida';
}

function enviarJson(req, res, status, datos, cookie) {
  const cabeceras = {
    ...CABECERAS_SEGURIDAD,
    ...cabecerasCors(req),
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  if (cookie) cabeceras['Set-Cookie'] = cookie;
  res.writeHead(status, cabeceras);
  res.end(JSON.stringify(datos));
}

function redirigir(res, destino) {
  res.writeHead(302, { Location: destino, 'Cache-Control': 'no-store' });
  res.end();
}

function leerCuerpoJson(req, limite = 10 * 1024) {
  return new Promise((resolve, reject) => {
    let tam = 0; const partes = [];
    req.on('data', c => {
      tam += c.length;
      if (tam > limite) { reject(Object.assign(new Error('Cuerpo demasiado grande'), { status: 413 })); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (!(req.headers['content-type'] || '').includes('application/json')) {
        return reject(Object.assign(new Error('Se esperaba JSON'), { status: 415 }));
      }
      try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function esArchivoPublicoPermitido(rutaRelativa) {
  const limpia = rutaRelativa.replace(/^\/+/, '');
  if (limpia === 'index.html' || limpia === 'login.html' || limpia === 'favicon.ico') return true;
  return /^(css|js|img|assets)\//.test(limpia);
}

async function enviarArchivo(req, res, rutaRelativa, sinCache = false) {
  if (!esArchivoPublicoPermitido(rutaRelativa)) {
    return enviarJson(req, res, 403, { error: 'Prohibido' });
  }
  const ruta = path.normalize(path.join(RAIZ, rutaRelativa));
  if (!ruta.startsWith(RAIZ + path.sep)) return enviarJson(req, res, 403, { error: 'Prohibido' });
  try {
    const contenido = await fs.readFile(ruta);
    res.writeHead(200, {
      ...CABECERAS_SEGURIDAD,
      'Content-Type': TIPOS[path.extname(ruta).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': sinCache ? 'no-store' : 'public, max-age=300'
    });
    res.end(contenido);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página no encontrada');
  }
}

// ---------- rutas ----------
async function manejar(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const ruta = url.pathname;
  const metodo = req.method;
  const ip = ipDe(req);

  // Preflight CORS para peticiones desde GitHub Pages
  if (metodo === 'OPTIONS' && ruta.startsWith('/api/')) {
    res.writeHead(204, { ...cabecerasCors(req), 'Access-Control-Max-Age': '86400' });
    return res.end();
  }

  // ===== APIs =====
  if (ruta.startsWith('/api/')) {
    let r;
    if (metodo === 'POST' && ruta === '/api/auth/login') {
      r = await auth.login(req, await leerCuerpoJson(req), ip);
    } else if (metodo === 'POST' && ruta === '/api/auth/logout') {
      r = await auth.logout(req, ip);
    } else if (metodo === 'GET' && ruta === '/api/auth/me') {
      r = await auth.yo(req);
    } else if (metodo === 'GET' && ruta === '/api/dashboard') {
      const sesion = await usuarioDeSesion(req);
      r = sesion
        ? { status: 200, datos: await obtenerDashboard(sesion.usuario) }
        : { status: 401, cookie: cookieBorrar(), datos: { error: 'Tu sesión expiró. Inicia sesión de nuevo.' } };
    } else if (metodo === 'GET' && ruta === '/api/salud') {
      r = { status: 200, datos: { ok: true, bd: config.dbName, fecha: new Date() } };
    } else {
      r = { status: 404, datos: { error: 'Ruta no encontrada' } };
    }
    return enviarJson(req, res, r.status, r.datos, r.cookie);
  }

  if (metodo !== 'GET' && metodo !== 'HEAD') return enviarJson(req, res, 405, { error: 'Método no permitido' });

  // ===== Páginas =====
  if (ruta === '/' || ruta === '/index.html') {
    if (!(await usuarioDeSesion(req))) return redirigir(res, '/login.html');
    return enviarArchivo(req, res, 'index.html', true);
  }
  if (ruta === '/login' || ruta === '/login.html') {
    if (await usuarioDeSesion(req)) return redirigir(res, '/index.html');
    return enviarArchivo(req, res, 'login.html', true);
  }
  return enviarArchivo(req, res, ruta.slice(1));
}

const servidor = http.createServer((req, res) => {
  manejar(req, res).catch(e => {
    if (e.status) return enviarJson(req, res, e.status, { error: e.message });
    console.error('[error]', e.errInfo ? JSON.stringify(e.errInfo) : e);
    if (!res.headersSent) enviarJson(req, res, 500, { error: 'Error interno del servidor. Revisa la consola.' });
  });
});

conectar()
  .then(db => {
    servidor.listen(config.port, '0.0.0.0', () => {
      console.log(`\n✔ Conectado a MongoDB Atlas, base "${db.databaseName}"`);
      console.log(`✔ Abre la app en http://localhost:${config.port}\n`);
    });
    const apagar = async () => { servidor.close(); await cerrar(); process.exit(0); };
    process.on('SIGINT', apagar);
    process.on('SIGTERM', apagar);
  })
  .catch(e => {
    console.error('\n✖ No se pudo conectar a MongoDB Atlas:', e.message);
    console.error('  Revisa: 1) MONGODB_URI en .env  2) Atlas > Network Access (agrega tu IP)  3) usuario y contraseña de la BD.\n');
    process.exit(1);
  });
