// Configuración leída de .env
import './env.js';

const uri = process.env.MONGODB_URI;
if (!uri || uri.includes('<')) {
  console.error('\n[config] Falta configurar MONGODB_URI en el archivo .env (copia .env.example como .env).\n');
  process.exit(1);
}

export const config = {
  mongoUri: uri,
  dbName: process.env.MONGODB_DB || 'hotel_hgi',
  port: Number(process.env.PORT) || 3000,
  sesionHoras: Number(process.env.SESION_HORAS) || 8,
  maxIntentos: Number(process.env.MAX_INTENTOS) || 5,
  minutosBloqueo: Number(process.env.MINUTOS_BLOQUEO) || 15,
  zonaHoraria: 'America/Monterrey',
  desfaseUtcH: 6, // Monterrey: UTC-6 todo el año (igual que en hotel_hgi.js)
  produccion: process.env.NODE_ENV === 'production'
};
