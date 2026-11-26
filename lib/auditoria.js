// Registro de eventos en la colección bitacora_auditoria.
// Respeta el $jsonSchema de hotel_hgi: evento, resultado y fecha obligatorios;
// usuario = { id, nombre, rol } cuando se conoce al usuario.

export const refUsuario = u => ({ id: u._id, nombre: u.nombre, rol: u.rol });

export function ipDe(req) {
  const ip = (req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '::1' ? '127.0.0.1' : ip || 'desconocida';
}

export async function registrarEvento(db, { evento, resultado, usuario, usuarioIntentado, ip, recurso, detalle }) {
  const doc = { evento, resultado, fecha: new Date() };
  if (usuario) doc.usuario = refUsuario(usuario);
  if (usuarioIntentado) doc.usuario_intentado = String(usuarioIntentado).slice(0, 60);
  if (ip) doc.ip = ip;
  if (recurso) doc.recurso = recurso;
  if (detalle) doc.detalle = detalle;
  try {
    await db.collection('bitacora_auditoria').insertOne(doc);
  } catch (e) {
    // Si el validador rechaza el documento, se muestra el motivo exacto en la consola
    console.error('[bitácora] No se pudo registrar el evento:', e.errInfo ? JSON.stringify(e.errInfo) : e.message);
  }
}
