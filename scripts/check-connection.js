// Prueba la conexión a Atlas y muestra cuántos documentos tiene cada colección de hotel_hgi (solo lectura)
import '../lib/env.js';
import { MongoClient } from 'mongodb';

if (!process.env.MONGODB_URI) { console.error('Falta MONGODB_URI en .env'); process.exit(1); }
const cliente = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
try {
  await cliente.connect();
  const db = cliente.db(process.env.MONGODB_DB || 'hotel_hgi');
  await db.command({ ping: 1 });
  const colecciones = await db.listCollections({}, { nameOnly: true }).toArray();
  console.log(`✔ Conectado a Atlas. Base "${db.databaseName}" con ${colecciones.length} colecciones:`);
  const filas = [];
  for (const { name } of colecciones.sort((a, b) => a.name.localeCompare(b.name))) {
    if (name.startsWith('system.')) continue;
    filas.push({ coleccion: name, documentos: await db.collection(name).countDocuments() });
  }
  console.table(filas);
} catch (e) {
  console.error('✖ No se pudo conectar:', e.message);
  console.error('  Revisa MONGODB_URI y que tu IP esté en Atlas > Network Access.');
  process.exitCode = 1;
} finally {
  await cliente.close();
}
