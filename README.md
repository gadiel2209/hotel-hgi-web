# HGI Operaciones · Sistema Web (Compatible con GitHub Pages + Backend Node.js)

Los archivos públicos (`index.html`, `login.html`, `css/` y `js/`) están ubicados en la **raíz del repositorio** para que **GitHub Pages** pueda servir la interfaz directamente.

## Estructura del proyecto

```
hotel-hgi-web/
├── index.html              ← ventana principal (raíz para GitHub Pages)
├── login.html              ← pantalla de inicio de sesión (raíz para GitHub Pages)
├── css/estilos.css         ← estilos
├── js/
│   ├── config-api.js       ← URL de tu servidor backend (Render / Railway)
│   ├── comun.js
│   ├── login.js
│   └── panel.js
├── server.js               ← servidor Node.js (APIs + conexión a MongoDB Atlas)
├── api/                    ← rutas /api/auth y /api/dashboard
├── lib/                    ← conexión DB, sesiones y auditoría
├── scripts/                ← utilidades de prueba y contraseñas
├── .env.example            ← plantilla de variables de entorno
└── package.json
```

## Cómo publicarlo para que funcione completo con GitHub Pages

Como GitHub Pages solo sirve archivos estáticos (HTML/CSS/JS) y no ejecuta Node.js ni se conecta directo a MongoDB Atlas, el despliegue se divide en dos pasos:

### Paso 1: Subir a GitHub y activar GitHub Pages (Frontend)
1. Sube todo el contenido de esta carpeta a un repositorio en GitHub.
2. En tu repositorio ve a **Settings > Pages**.
3. En **Source**, elige `Deploy from a branch`, selecciona la rama `main` y la carpeta `/ (root)`, y guarda.
4. GitHub Pages publicará tu página en `https://<tu-usuario>.github.io/<tu-repositorio>/`.

### Paso 2: Encender el servidor API en Render o Railway (Backend)
1. En **MongoDB Atlas > Network Access**, agrega `0.0.0.0/0` para permitir conexiones desde la nube.
2. Crea un **Web Service** gratuito en [Render](https://render.com) o [Railway](https://railway.app) conectado a tu mismo repositorio de GitHub:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. Agrega tus **Environment Variables** en el hosting (`MONGODB_URI`, `MONGODB_DB=hotel_hgi`, `NODE_ENV=production`).
4. Copia la URL pública que te dé Render (ej. `https://hotel-hgi-web.onrender.com`) y pégala en `js/config-api.js` (o directamente en el panel **"Conexión con servidor API"** de `login.html`).

## Ejecución en computadora local

```bash
npm install
cp .env.example .env   # pega tu MONGODB_URI
npm start              # abre http://localhost:3000
```
