// Pantalla de login: envía usuario y contraseña a /api/auth/login
import { api, obtenerApiBase, guardarApiBase, esHostingEstatico } from './comun.js';

const form = document.getElementById('form-login');
const inUsuario = document.getElementById('usuario');
const inPassword = document.getElementById('password');
const btnEntrar = document.getElementById('btn-entrar');
const btnOjo = document.getElementById('btn-ojo');
const alerta = document.getElementById('alerta');
const alertaTitulo = document.getElementById('alerta-titulo');
const alertaMensaje = document.getElementById('alerta-mensaje');

function mostrarAlerta(mensaje, tipo = 'error') {
  alerta.className = `alerta alerta-${tipo}`;
  alerta.querySelector('.alerta-icono').textContent = tipo === 'bloqueo' ? '🔒' : '⚠';
  alertaTitulo.textContent = tipo === 'bloqueo' ? 'Acceso bloqueado' : 'No se pudo iniciar sesión';
  alertaMensaje.textContent = mensaje;
  alerta.hidden = false;
  [inUsuario, inPassword].forEach(i => i.setAttribute('aria-invalid', 'true'));
  form.classList.remove('sacudir');
  void form.offsetWidth; // reinicia la animación
  form.classList.add('sacudir');
}

function ocultarAlerta() {
  alerta.hidden = true;
  [inUsuario, inPassword].forEach(i => i.setAttribute('aria-invalid', 'false'));
}

btnOjo.addEventListener('click', () => {
  const ver = inPassword.type === 'password';
  inPassword.type = ver ? 'text' : 'password';
  btnOjo.textContent = ver ? 'Ocultar' : 'Mostrar';
  btnOjo.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
});

[inUsuario, inPassword].forEach(i => i.addEventListener('input', () => i.setAttribute('aria-invalid', 'false')));

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (btnEntrar.disabled) return;
  ocultarAlerta();

  const usuario = inUsuario.value.trim();
  const password = inPassword.value;
  if (!usuario || !password) {
    mostrarAlerta('Escribe tu usuario y tu contraseña.', 'aviso');
    (usuario ? inPassword : inUsuario).focus();
    return;
  }

  btnEntrar.disabled = true;
  btnEntrar.innerHTML = '<span class="spinner spinner-chico" aria-hidden="true"></span> Verificando…';
  try {
    const datos = await api('/auth/login', { method: 'POST', body: { usuario, password } });
    if (datos.token) sessionStorage.setItem('hgi_token', datos.token);
    sessionStorage.setItem('hgi_acceso_anterior', datos.acceso_anterior || '');
    window.location.replace('index.html'); // acceso concedido → ventana principal
  } catch (err) {
    const bloqueo = ['CUENTA_BLOQUEADA', 'CUENTA_INACTIVA', 'DEMASIADOS_INTENTOS'].includes(err.codigo);
    mostrarAlerta(err.message, bloqueo ? 'bloqueo' : err.codigo === 'VACIO' ? 'aviso' : 'error');
    inPassword.value = '';
    inPassword.focus();
    btnEntrar.disabled = false;
    btnEntrar.textContent = 'Entrar';
  }
});

// Configuración de URL del servidor backend cuando se usa GitHub Pages
const configServidor = document.getElementById('config-servidor');
const inputApiUrl = document.getElementById('input-api-url');
const btnGuardarApi = document.getElementById('btn-guardar-api');
const estadoApiUrl = document.getElementById('estado-api-url');

if (configServidor && inputApiUrl && btnGuardarApi) {
  const actual = obtenerApiBase();
  inputApiUrl.value = actual;
  if (actual) estadoApiUrl.textContent = `Conectando a: ${actual}`;
  if (!actual && esHostingEstatico()) {
    configServidor.open = true;
    estadoApiUrl.textContent = 'Pega la URL de tu backend en Render/Railway para habilitar el inicio de sesión.';
  }
  btnGuardarApi.addEventListener('click', () => {
    guardarApiBase(inputApiUrl.value);
    const nueva = obtenerApiBase();
    estadoApiUrl.textContent = nueva ? `✔ Guardado: ${nueva}` : 'URL limpiada (usando mismo servidor).';
    ocultarAlerta();
  });
}
