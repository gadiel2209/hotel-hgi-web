// Conexión única a MongoDB Atlas con el driver oficial de Node.js
import { MongoClient } from 'mongodb';
import { config } from './config.js';

const cliente = new MongoClient(config.mongoUri, {
  appName: 'hotel-hgi-web',
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10
});

let db = null;

export async function conectar() {
  if (db) return db;
  await cliente.connect();
  const base = cliente.db(config.dbName);
  await base.command({ ping: 1 });

  // La base hotel_hgi debe existir: la app nunca la crea ni la borra
  const colecciones = (await base.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name);
  const necesarias = ['usuarios', 'habitaciones', 'incidencias', 'bitacora_auditoria', 'registros_llegada', 'notificaciones', 'predicciones_ia'];
  const faltan = necesarias.filter(n => !colecciones.includes(n));
  if (faltan.length) {
    throw new Error(`La base "${config.dbName}" no tiene las colecciones: ${faltan.join(', ')}. ` +
      'Revisa MONGODB_DB o ejecuta primero hotel_hgi.js en Atlas.');
  }
  db = base;
  return db;
}

export function getDb() {
  if (!db) throw new Error('La base de datos todavía no está conectada');
  return db;
}

export const cerrar = () => cliente.close();
