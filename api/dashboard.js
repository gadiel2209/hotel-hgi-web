// GET /api/dashboard: información real de hotel_hgi para la ventana principal
import { config } from '../lib/config.js';
import { getDb } from '../lib/db.js';

const ESTADOS_HAB = ['ocupada', 'sucia', 'en_limpieza', 'lista', 'bloqueada'];
const INC_ABIERTAS = ['abierta', 'asignada', 'en_atencion'];
const PESO_PRIORIDAD = { urgente: 0, alta: 1, media: 2, baja: 3 };
const ROLES_GLOBALES = ['administracion', 'gerencia'];

// Inicio y fin del día LOCAL (Monterrey, UTC-6) que contiene a "fecha"
function rangoDiaLocal(fecha) {
  const desfase = config.desfaseUtcH * 3600000;
  const local = new Date(fecha.getTime() - desfase);
  const inicio = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + desfase);
  return { inicio, fin: new Date(inicio.getTime() + 86400000) };
}

async function resumenHabitaciones(db) {
  const col = db.collection('habitaciones');
  const [grupos, bloqueadas, enProceso] = await Promise.all([
    col.aggregate([{ $group: { _id: '$estado_actual', total: { $sum: 1 } } }]).toArray(),
    col.find({ estado_actual: 'bloqueada' }, { projection: { numero: 1, 'bloqueo.motivo': 1 } }).sort({ numero: 1 }).toArray(),
    col.find({ estado_actual: { $in: ['sucia', 'en_limpieza'] } }, { projection: { numero: 1, estado_actual: 1, 'asignacion_actual.nombre': 1 } })
      .sort({ numero: 1 }).limit(20).toArray()
  ]);
  const por_estado = Object.fromEntries(ESTADOS_HAB.map(e => [e, 0]));
  grupos.forEach(g => { por_estado[g._id] = g.total; });
  return {
    total: Object.values(por_estado).reduce((a, b) => a + b, 0),
    por_estado,
    bloqueadas: bloqueadas.map(h => ({ numero: h.numero, motivo: h.bloqueo?.motivo || 'Sin motivo registrado' })),
    en_proceso: enProceso.map(h => ({ numero: h.numero, estado: h.estado_actual, camarista: h.asignacion_actual?.nombre || null }))
  };
}

async function resumenIncidencias(db) {
  const col = db.collection('incidencias');
  const filtro = { estado: { $in: INC_ABIERTAS } };
  const [porEstado, porPrioridad, docs] = await Promise.all([
    col.aggregate([{ $match: filtro }, { $group: { _id: '$estado', total: { $sum: 1 } } }]).toArray(),
    col.aggregate([{ $match: filtro }, { $group: { _id: '$prioridad', total: { $sum: 1 } } }]).toArray(),
    col.find(filtro, {
      projection: { folio: 1, ubicacion: 1, categoria: 1, prioridad: 1, estado: 1, descripcion: 1, 'tecnico.nombre': 1, 'fechas.reportada': 1 }
    }).sort({ 'fechas.reportada': -1 }).limit(50).toArray()
  ]);
  const por_estado = Object.fromEntries(INC_ABIERTAS.map(e => [e, 0]));
  porEstado.forEach(g => { por_estado[g._id] = g.total; });
  const por_prioridad = { urgente: 0, alta: 0, media: 0, baja: 0 };
  porPrioridad.forEach(g => { por_prioridad[g._id] = g.total; });

  const lista = docs
    .sort((a, b) => (PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad]) || (b.fechas.reportada - a.fechas.reportada))
    .slice(0, 10)
    .map(i => ({
      folio: i.folio,
      ubicacion: i.ubicacion.tipo === 'habitacion' ? `Habitación ${i.ubicacion.numero}` : `Área: ${i.ubicacion.area}`,
      categoria: i.categoria,
      prioridad: i.prioridad,
      estado: i.estado,
      descripcion: i.descripcion,
      tecnico: i.tecnico?.nombre || null,
      reportada: i.fechas.reportada
    }));

  return {
    abiertas: Object.values(por_estado).reduce((a, b) => a + b, 0),
    urgentes: por_prioridad.urgente,
    por_estado,
    por_prioridad,
    lista
  };
}

async function resumenLlegadas(db) {
  const col = db.collection('registros_llegada');
  let { inicio, fin } = rangoDiaLocal(new Date());
  let es_hoy = true;
  // Los datos simulados son de oct-nov 2026: si hoy no hay llegadas, se muestra el último día con registros
  if (!(await col.countDocuments({ llegada_en: { $gte: inicio, $lt: fin } }))) {
    const ultima = await col.find({}, { projection: { llegada_en: 1 } }).sort({ llegada_en: -1 }).limit(1).next();
    if (ultima) { ({ inicio, fin } = rangoDiaLocal(ultima.llegada_en)); es_hoy = false; }
  }
  const docs = await col.find(
    { llegada_en: { $gte: inicio, $lt: fin } },
    { projection: { reservacion: 1, llegada_en: 1, estado: 1, habitacion_numero: 1, espera_min: 1, canal_confirmacion: 1 } }
  ).sort({ llegada_en: 1 }).toArray();

  const esperas = docs.filter(d => typeof d.espera_min === 'number').map(d => d.espera_min);
  const horaLocal = d => new Date(d.llegada_en.getTime() - config.desfaseUtcH * 3600000).getUTCHours();
  const enEspera = docs.filter(d => d.estado === 'en_espera');
  const atendidos = docs.filter(d => d.estado === 'atendido');

  return {
    fecha: inicio,
    es_hoy,
    total: docs.length,
    atendidos: atendidos.length,
    en_espera: enEspera.length,
    en_horario_pico: docs.filter(d => { const h = horaLocal(d); return h >= 15 && h < 18; }).length,
    espera_prom_min: esperas.length ? Math.round((esperas.reduce((a, b) => a + b, 0) / esperas.length) * 10) / 10 : null,
    registros_incompletos: atendidos.filter(d => typeof d.espera_min !== 'number').length,
    lista: [...enEspera, ...atendidos.slice(-8).reverse()].map(d => ({
      reservacion: d.reservacion,
      llegada_en: d.llegada_en,
      estado: d.estado,
      habitacion: d.habitacion_numero ?? null,
      espera_min: d.espera_min ?? null,
      canal: d.canal_confirmacion || null
    }))
  };
}

async function resumenNotificaciones(db, usuario) {
  const col = db.collection('notificaciones');
  const global = ROLES_GLOBALES.includes(usuario.rol);
  const filtro = { leida: false, ...(global ? {} : { destinatario_rol: usuario.rol }) };
  const [porTipo, porRol, lista] = await Promise.all([
    col.aggregate([{ $match: filtro }, { $group: { _id: '$tipo', total: { $sum: 1 } } }]).toArray(),
    col.aggregate([{ $match: filtro }, { $group: { _id: '$destinatario_rol', total: { $sum: 1 } } }]).toArray(),
    col.find(filtro, { projection: { tipo: 1, mensaje: 1, destinatario_rol: 1, creada_en: 1, 'habitacion.numero': 1 } })
      .sort({ creada_en: -1 }).limit(8).toArray()
  ]);
  return {
    alcance: global ? 'todos' : usuario.rol,
    no_leidas: porTipo.reduce((a, g) => a + g.total, 0),
    por_tipo: Object.fromEntries(porTipo.map(g => [g._id, g.total])),
    por_rol: Object.fromEntries(porRol.map(g => [g._id, g.total])),
    lista: lista.map(n => ({ id: n._id, tipo: n.tipo, mensaje: n.mensaje, rol: n.destinatario_rol, creada_en: n.creada_en, habitacion: n.habitacion?.numero ?? null }))
  };
}

async function resumenPredicciones(db) {
  const col = db.collection('predicciones_ia');
  const [porTipo, riesgo, tiempoStats, tiempoRecientes, calidadTotal, calidad, modelos] = await Promise.all([
    col.aggregate([{ $group: { _id: '$tipo', total: { $sum: 1 }, ultima: { $max: '$creada_en' } } }, { $sort: { _id: 1 } }]).toArray(),
    // Última predicción de mantenimiento por cada nodo ESP32
    col.aggregate([
      { $match: { tipo: 'mantenimiento_predictivo' } },
      { $sort: { creada_en: -1 } },
      { $group: { _id: '$objetivo.id', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { 'resultado.probabilidad_falla': -1 } }
    ]).toArray(),
    col.aggregate([
      { $match: { tipo: 'tiempo_habitacion_lista', error_abs: { $type: 'number' } } },
      { $group: { _id: null, total: { $sum: 1 }, mae: { $avg: '$error_abs' }, confianza: { $avg: '$confianza' } } }
    ]).toArray(),
    col.aggregate([
      { $match: { tipo: 'tiempo_habitacion_lista' } },
      { $sort: { creada_en: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'habitaciones', localField: 'objetivo.id', foreignField: '_id', as: 'hab', pipeline: [{ $project: { numero: 1 } }] } }
    ]).toArray(),
    col.countDocuments({ tipo: 'calidad_datos' }),
    col.find({ tipo: 'calidad_datos' }, { projection: { 'objetivo.coleccion': 1, 'resultado.descripcion': 1, creada_en: 1 } })
      .sort({ creada_en: -1 }).limit(6).toArray(),
    db.collection('modelos_ia').find({ activo: true }, { projection: { nombre: 1, version: 1, algoritmo: 1, metricas: 1 } })
      .sort({ nombre: 1 }).toArray()
  ]);
  const ts = tiempoStats[0];
  return {
    por_tipo: porTipo.map(t => ({ tipo: t._id, total: t.total, ultima: t.ultima })),
    riesgo: riesgo.map(p => ({
      habitacion: p.resultado?.habitacion_numero ?? null,
      probabilidad: p.resultado?.probabilidad_falla ?? 0,
      temperatura: p.resultado?.temperatura_prom_24h ?? null,
      recomendacion: p.resultado?.recomendacion || '',
      creada_en: p.creada_en
    })),
    tiempo: {
      total: ts?.total || 0,
      mae_min: ts ? Math.round(ts.mae * 10) / 10 : null,
      confianza_prom: ts ? Math.round(ts.confianza * 100) / 100 : null,
      recientes: tiempoRecientes.map(p => ({
        habitacion: p.hab?.[0]?.numero ?? null,
        estimado: p.resultado?.minutos_estimados ?? null,
        real: p.valor_real ?? null,
        error: p.error_abs ?? null,
        creada_en: p.creada_en
      }))
    },
    calidad: {
      total: calidadTotal,
      lista: calidad.map(c => ({ coleccion: c.objetivo.coleccion, descripcion: c.resultado?.descripcion || '' }))
    },
    modelos: modelos.map(m => ({ nombre: m.nombre, version: m.version, algoritmo: m.algoritmo, metricas: m.metricas }))
  };
}

export async function obtenerDashboard(usuario) {
  const db = getDb();
  const [habitaciones, incidencias, llegadas, notificaciones, predicciones] = await Promise.all([
    resumenHabitaciones(db),
    resumenIncidencias(db),
    resumenLlegadas(db),
    resumenNotificaciones(db, usuario),
    resumenPredicciones(db)
  ]);
  return { generado_en: new Date(), habitaciones, incidencias, llegadas, notificaciones, predicciones };
}
