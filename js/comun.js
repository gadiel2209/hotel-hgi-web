// Funciones compartidas por las páginas

import { API_BASE_URL } from './config-api.js';

export function obtenerApiBase() {
  const guardada = localStorage.getItem('hgi_api_url') || '';
  return (API_BASE_URL || guardada).trim().replace(/\/+$/, '');
}

export function guardarApiBase(url) {
  const limpia = String(url || '').trim().replace(/\/+$/, '');
  if (limpia) localStorage.setItem('hgi_api_url', limpia);
  else localStorage.removeItem('hgi_api_url');
}

export function esHostingEstatico() {
  return window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
}

// Llama a las APIs (localmente al mismo servidor o al backend configurado para GitHub Pages)
export async function api(ruta, { method = 'GET', body } = {}) {
  const base = obtenerApiBase();
  if (!base && esHostingEstatico()) {
    throw Object.assign(
      new Error('Falta configurar la URL del servidor backend (Render/Railway) en js/config-api.js o en "Conexión con servidor API".'),
      { status: 0, codigo: 'NO_BACKEND_URL' }
    );
  }

  const token = sessionStorage.getItem('hgi_token');
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let r;
  try {
    r = await fetch(`${base}/api${ruta}`, {
      method,
      credentials: base ? 'include' : 'same-origin',
      headers: Object.keys(headers).length ? headers : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw Object.assign(
      new Error('No se pudo conectar con el servidor API. Verifica que esté encendido y que la URL sea correcta.'),
      { status: 0 }
    );
  }
  let datos = null;
  try { datos = await r.json(); } catch { /* sin JSON */ }
  if (!r.ok) throw Object.assign(new Error(datos?.error || `Error ${r.status}`), { status: r.status, codigo: datos?.codigo });
  return datos;
}

// Escapa texto antes de insertarlo como HTML (evita inyección de código)
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TZ = 'America/Monterrey';
export const fechaHora = f => f ? new Date(f).toLocaleString('es-MX', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const soloHora = f => f ? new Date(f).toLocaleTimeString('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '—';
export const fechaLarga = f => f ? new Date(f).toLocaleDateString('es-MX', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';

export const ROLES = { recepcion: 'Recepción', limpieza: 'Limpieza', mantenimiento: 'Mantenimiento', administracion: 'Administración', gerencia: 'Gerencia' };
export const ESTADOS_HAB = [
  { clave: 'ocupada', etiqueta: 'Ocupadas', color: 'var(--c-ocupada)' },
  { clave: 'sucia', etiqueta: 'Sucias', color: 'var(--c-sucia)' },
  { clave: 'en_limpieza', etiqueta: 'En limpieza', color: 'var(--c-limpieza)' },
  { clave: 'lista', etiqueta: 'Listas', color: 'var(--c-lista)' },
  { clave: 'bloqueada', etiqueta: 'Bloqueadas', color: 'var(--c-bloqueada)' }
];
export const ESTADOS_INC = { abierta: 'Abierta', asignada: 'Asignada', en_atencion: 'En atención', cerrada: 'Cerrada' };
export const CATEGORIAS = {
  electrica: 'Eléctrica', plomeria: 'Plomería', aire_acondicionado: 'Aire acondicionado', mobiliario: 'Mobiliario',
  cerrajeria: 'Cerrajería', tv_internet: 'TV / Internet', otra: 'Otra'
};
export const TIPOS_NOTIF = {
  habitacion_lista: 'Habitación lista', incidencia_nueva: 'Incidencia nueva', incidencia_asignada: 'Incidencia asignada',
  alerta_sensor: 'Alerta de sensor', prediccion: 'Predicción IA'
};
export const MODELOS = {
  tiempo_habitacion_lista: 'Tiempo para habitación lista',
  mantenimiento_predictivo: 'Mantenimiento predictivo',
  calidad_datos: 'Calidad de datos'
};
export const iniciales = n => (n || '?').split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
