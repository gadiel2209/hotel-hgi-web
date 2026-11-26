// Genera un hash bcrypt real y lo guarda en usuarios de hotel_hgi (Atlas).
// Uso:
//   npm run set-password -- --listar                 (muestra los usuarios)
//   npm run set-password -- atorres Demo2026!        (un usuario)
//   npm run set-password -- --todos Demo2026!        (todos los usuarios)
// También reinicia intentos_fallidos a 0 y quita el bloqueo.
import '../lib/env.js';
import bcrypt from 'bcryptjs';
import { MongoClient, Int32 } from 'mongodb';

const [objetivo, password] = process.argv.slice(2);
if (!process.env.MONGODB_URI) { console.error('Falta MONGODB_URI en .env'); process.exit(1); }
if (!objetivo || (objetivo !== '--listar' && !password)) {
  console.log('Uso:\n  npm run set-password -- --listar\n  npm run set-password -- <usuario> <contraseña>\n  npm run set-password -- --todos <contraseña>');
  process.exit(1);
}

const cliente = new MongoClient(process.env.MONGODB_URI);
try {
  await cliente.connect();
  const usuarios = cliente.db(process.env.MONGODB_DB || 'hotel_hgi').collection('usuarios');

  if (objetivo === '--listar') {
    const lista = await usuarios.find({}, { projection: { usuario: 1, nombre: 1, rol: 1, puesto: 1, activo: 1, intentos_fallidos: 1 } })
      .sort({ rol: 1, usuario: 1 }).toArray();
    console.table(lista.map(u => ({ usuario: u.usuario, nombre: u.nombre, rol: u.rol, puesto: u.puesto, activo: u.activo, intentos: u.intentos_fallidos })));
  } else {
    if (password.length < 8) console.warn('Aviso: usa una contraseña de al menos 8 caracteres.');
    const hash = bcrypt.hashSync(password, 10);
    const filtro = objetivo === '--todos' ? {} : { usuario: objetivo.trim().toLowerCase() };
    const r = await usuarios.updateMany(filtro, {
      $set: { password_hash: hash, algoritmo_hash: 'bcrypt', intentos_fallidos: new Int32(0), bloqueado_hasta: null }
    });
    if (!r.matchedCount) {
      console.error(`No existe el usuario "${objetivo}". Ejecuta: npm run set-password -- --listar`);
      process.exitCode = 1;
    } else {
      console.log(`Hash generado: ${hash}`);
      console.log(`✔ Contraseña actualizada en ${r.modifiedCount} usuario(s). Ya puedes iniciar sesión.`);
    }
  }
} catch (e) {
  console.error('Error:', e.errInfo ? JSON.stringify(e.errInfo) : e.message);
  process.exitCode = 1;
} finally {
  await cliente.close();
}
