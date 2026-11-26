// Ventana principal: datos del usuario, cierre de sesión y tableros con datos reales de hotel_hgi
import { api, esc, fechaHora, soloHora, fechaLarga, iniciales, ROLES, ESTADOS_HAB, ESTADOS_INC, CATEGORIAS, TIPOS_NOTIF, MODELOS } from './comun.js';

const $ = id => document.getElementById(id);
const irAlLogin = () => window.location.replace('login.html');

// ---------- Usuario y sesión ----------
async function cargarUsuario() {
  try {
    const { usuario } = await api('/auth/me');
    $('avatar').textContent = iniciales(usuario.nombre);
    $('usuario-nombre').textContent = usuario.nombre;
    $('usuario-puesto').textContent = usuario.puesto || 'Sin puesto';
    $('usuario-rol').textContent = ROLES[usuario.rol] || usuario.rol;
    $('usuario-rol').className = `rol rol-${usuario.rol}`;
    $('saludo').textContent = `Hola, ${usuario.nombre.split(' ')[0]}`;
    const anterior = sessionStorage.getItem('hgi_acceso_anterior');
    $('detalle-usuario').innerHTML = `Usuario <code>${esc(usuario.usuario)}</code> · rol <strong>${esc(usuario.rol)}</strong>` +
      (anterior ? ` · último acceso anterior: ${esc(fechaHora(anterior))}` : '');
    return true;
  } catch (e) {
    if (e.status === 401 || e.codigo === 'NO_BACKEND_URL') irAlLogin();
    return false;
  }
}

$('btn-salir').addEventListener('click', async () => {
  const btn = $('btn-salir');
  btn.disabled = true;
  btn.textContent = 'Cerrando…';
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* aunque falle, se sale */ }
  sessionStorage.removeItem('hgi_token');
  sessionStorage.removeItem('hgi_acceso_anterior');
  irAlLogin();
});

// ---------- Secciones ----------
function htmlHabitaciones(d) {
  const tarjetas = ESTADOS_HAB.map(e => {
    const n = d.por_estado[e.clave] || 0;
    const pct = d.total ? Math.round((n / d.total) * 100) : 0;
    return `<article class="tarjeta-estado" style="--color:${e.color}">
      <span class="tarjeta-etiqueta"><span class="punto"></span>${e.etiqueta}</span>
      <strong class="tarjeta-numero">${n}</strong>
      <span class="muted">${pct} % del hotel</span>
    </article>`;
  }).join('');
  const barra = ESTADOS_HAB.filter(e => d.por_estado[e.clave] > 0)
    .map(e => `<span style="flex-grow:${d.por_estado[e.clave]};background:${e.color}" title="${e.etiqueta}: ${d.por_estado[e.clave]}"></span>`).join('');
  const enProceso = d.en_proceso.length ? `<p><strong>En proceso:</strong> ${d.en_proceso.map(h =>
    `<span class="chip">${h.numero} · ${h.estado === 'sucia' ? 'sucia' : 'en limpieza'}${h.camarista ? ` · ${esc(h.camarista)}` : ''}</span>`).join(' ')}</p>` : '';
  const bloqueadas = d.bloqueadas.length ? `<p><strong>Fuera de servicio:</strong> ${d.bloqueadas.map(h =>
    `<span class="chip chip-gris">${h.numero} · ${esc(h.motivo)}</span>`).join(' ')}</p>` : '';
  return `<div class="seccion-titulo"><h2>Habitaciones por estado</h2><span class="muted">${d.total} habitaciones en total</span></div>
    <div class="tarjetas-estado">${tarjetas}</div>
    <div class="barra-proporcion" role="img" aria-label="${ESTADOS_HAB.map(e => `${e.etiqueta}: ${d.por_estado[e.clave]}`).join(', ')}">${barra}</div>
    <div class="detalle-hab">${enProceso}${bloqueadas}</div>`;
}

function htmlIncidencias(d) {
  const lista = d.lista.length ? `<ul class="lista">${d.lista.map(i => `
    <li class="fila">
      <div class="fila-principal">
        <span class="prioridad p-${esc(i.prioridad)}">${esc(i.prioridad)}</span>
        <div><strong>${esc(i.folio)}</strong> · ${esc(i.ubicacion)}
          <small>${esc(CATEGORIAS[i.categoria] || i.categoria)} — ${esc(i.descripcion)}</small></div>
      </div>
      <div class="fila-meta">
        <span class="estado-inc e-${esc(i.estado)}">${esc(ESTADOS_INC[i.estado])}</span>
        <small>${esc(i.tecnico || 'Sin técnico')} · ${fechaHora(i.reportada)}</small>
      </div>
    </li>`).join('')}</ul>` : '<p class="vacio">No hay incidencias abiertas. ✔</p>';
  return `<div class="panel-titulo"><h2>Incidencias de mantenimiento</h2><span class="muted">no cerradas</span></div>
    <div class="kpis">
      <div class="kpi"><strong>${d.abiertas}</strong><span>Abiertas</span></div>
      <div class="kpi ${d.urgentes ? 'kpi-alerta' : ''}"><strong>${d.urgentes}</strong><span>Urgentes</span></div>
      <div class="kpi"><strong>${d.por_prioridad.alta}</strong><span>Alta prioridad</span></div>
    </div>
    <p class="muted pequeno">${Object.entries(d.por_estado).map(([k, v]) => `${ESTADOS_INC[k]}: ${v}`).join(' · ')}</p>
    ${lista}`;
}

function htmlLlegadas(d) {
  const tabla = d.lista.length ? `<table class="tabla">
    <thead><tr><th>Reservación</th><th>Llegada</th><th>Hab.</th><th>Espera</th><th>Estado</th></tr></thead>
    <tbody>${d.lista.map(l => `<tr>
      <td><code>${esc(l.reservacion)}</code></td><td>${soloHora(l.llegada_en)}</td><td>${l.habitacion ?? '—'}</td>
      <td>${l.espera_min != null ? `${l.espera_min} min` : '—'}</td>
      <td><span class="etiqueta ${l.estado === 'en_espera' ? 'etiqueta-aviso' : 'etiqueta-ok'}">${l.estado === 'en_espera' ? 'En espera' : 'Atendido'}</span></td>
    </tr>`).join('')}</tbody></table>` : '<p class="vacio">Sin llegadas registradas.</p>';
  return `<div class="panel-titulo"><h2>Llegadas de huéspedes</h2><span class="muted">${d.es_hoy ? 'hoy' : 'último día con registros'}</span></div>
    <p class="muted pequeno capital">${esc(fechaLarga(d.fecha))}${d.es_hoy ? '' : ' (hoy todavía no hay llegadas registradas)'}</p>
    <div class="kpis">
      <div class="kpi"><strong>${d.total}</strong><span>Llegadas</span></div>
      <div class="kpi"><strong>${d.atendidos}</strong><span>Atendidas</span></div>
      <div class="kpi ${d.en_espera ? 'kpi-aviso' : ''}"><strong>${d.en_espera}</strong><span>En espera</span></div>
      <div class="kpi"><strong>${d.espera_prom_min ?? '—'}</strong><span>Espera prom. (min)</span></div>
    </div>
    <p class="muted pequeno">${d.en_horario_pico} en horario pico (15:00–18:00)${d.registros_incompletos ? ` · ${d.registros_incompletos} registro(s) sin tiempo de espera` : ''}</p>
    ${tabla}`;
}

function htmlNotificaciones(d) {
  const tipos = Object.entries(d.por_tipo).map(([t, n]) => `<div class="kpi"><strong>${n}</strong><span>${esc(TIPOS_NOTIF[t] || t)}</span></div>`).join('');
  const porRol = d.alcance === 'todos' && Object.keys(d.por_rol).length
    ? `<p class="muted pequeno">Por rol: ${Object.entries(d.por_rol).map(([r, n]) => `${ROLES[r] || esc(r)} ${n}`).join(' · ')}</p>` : '';
  const lista = d.lista.length ? `<ul class="lista">${d.lista.map(n => `
    <li class="fila">
      <div class="fila-principal"><span class="icono-notif n-${esc(n.tipo)}" aria-hidden="true"></span>
        <div><strong>${esc(n.mensaje)}</strong><small>${esc(TIPOS_NOTIF[n.tipo] || n.tipo)} · ${esc(ROLES[n.rol] || n.rol)}</small></div></div>
      <small class="fila-meta">${fechaHora(n.creada_en)}</small>
    </li>`).join('')}</ul>` : '<p class="vacio">Estás al día: no hay notificaciones pendientes. ✔</p>';
  return `<div class="panel-titulo"><h2>Notificaciones no leídas</h2><span class="muted">${d.alcance === 'todos' ? 'todos los roles' : `para ${esc(ROLES[d.alcance])}`}</span></div>
    <div class="kpis"><div class="kpi ${d.no_leidas ? 'kpi-aviso' : ''}"><strong>${d.no_leidas}</strong><span>Sin leer</span></div>${tipos}</div>
    ${porRol}${lista}`;
}

function htmlPredicciones(d) {
  const total = d.por_tipo.reduce((a, t) => a + t.total, 0);
  const kpis = d.por_tipo.map(t => `<div class="kpi"><strong>${t.total}</strong><span>${esc(MODELOS[t.tipo] || t.tipo)}</span></div>`).join('');
  const riesgo = d.riesgo.map(r => {
    const pct = Math.round(r.probabilidad * 100);
    const nivel = pct >= 50 ? 'alto' : pct >= 25 ? 'medio' : 'bajo';
    return `<li>
      <div class="riesgo-cabecera"><strong>Hab. ${r.habitacion}</strong><span class="riesgo-${nivel}">${pct} %</span></div>
      <div class="medidor"><span class="medidor-${nivel}" style="width:${Math.max(pct, 2)}%"></span></div>
      <small>${r.temperatura} °C prom. 24 h · ${esc(r.recomendacion)}</small>
    </li>`;
  }).join('');
  const tiempo = d.tiempo.recientes.length ? `<table class="tabla">
    <thead><tr><th>Hab.</th><th>Estimado</th><th>Real</th><th>Error</th></tr></thead>
    <tbody>${d.tiempo.recientes.map(p => `<tr><td>${p.habitacion ?? '—'}</td><td>${p.estimado} min</td><td>${p.real ?? '—'} min</td><td>${p.error ?? '—'} min</td></tr>`).join('')}</tbody>
  </table>` : '<p class="vacio">Sin predicciones.</p>';
  const calidad = d.calidad.lista.map(c => `<li><span class="chip chip-gris">${esc(c.coleccion)}</span> ${esc(c.descripcion)}</li>`).join('');
  const modelos = d.modelos.map(m => `<span class="chip" title="${esc(JSON.stringify(m.metricas))}">${esc(MODELOS[m.nombre] || m.nombre)} v${esc(m.version)} · ${esc(m.algoritmo)}</span>`).join('');
  const ultima = d.por_tipo.map(t => t.ultima).sort().at(-1);

  return `<div class="panel-titulo"><h2>Predicciones de IA</h2><span class="muted">${total} predicciones registradas</span></div>
    <div class="kpis">${kpis}<div class="kpi"><strong>${d.tiempo.mae_min ?? '—'}</strong><span>Error prom. tiempo (min)</span></div></div>
    <div class="columnas">
      <div><h3>Riesgo de falla del aire acondicionado</h3>${riesgo ? `<ul class="lista-riesgo">${riesgo}</ul>` : '<p class="vacio">Sin predicciones de mantenimiento.</p>'}</div>
      <div>
        <h3>Tiempo estimado para habitación lista</h3>${tiempo}
        <p class="muted pequeno">${d.tiempo.total} predicciones evaluadas · confianza promedio ${d.tiempo.confianza_prom ?? '—'}</p>
        <h3>Calidad de datos (${d.calidad.total} hallazgos)</h3><ul class="lista-simple">${calidad}</ul>
      </div>
    </div>
    <div class="modelos">${modelos}</div>
    <p class="muted pequeno">Última predicción: ${fechaHora(ultima)}</p>`;
}

// ---------- Carga de datos ----------
let cargandoAhora = false;
async function cargarDashboard() {
  if (cargandoAhora) return;
  cargandoAhora = true;
  const btn = $('btn-actualizar');
  btn.disabled = true;
  btn.textContent = 'Actualizando…';
  try {
    const d = await api('/dashboard');
    $('sec-habitaciones').innerHTML = htmlHabitaciones(d.habitaciones);
    $('sec-incidencias').innerHTML = htmlIncidencias(d.incidencias);
    $('sec-llegadas').innerHTML = htmlLlegadas(d.llegadas);
    $('sec-notificaciones').innerHTML = htmlNotificaciones(d.notificaciones);
    $('sec-predicciones').innerHTML = htmlPredicciones(d.predicciones);
    $('actualizado').textContent = `Actualizado ${soloHora(d.generado_en)}`;
    $('sec-habitaciones').hidden = false;
    $('rejilla').hidden = false;
    $('error').hidden = true;
  } catch (e) {
    if (e.status === 401) return irAlLogin(); // sesión vencida
    $('error-mensaje').textContent = e.message;
    $('error').hidden = false;
  } finally {
    $('cargando').hidden = true;
    btn.disabled = false;
    btn.textContent = '↻ Actualizar';
    cargandoAhora = false;
  }
}

$('btn-actualizar').addEventListener('click', cargarDashboard);

if (await cargarUsuario()) {
  await cargarDashboard();
  setInterval(cargarDashboard, 60000); // se actualiza cada minuto
}
