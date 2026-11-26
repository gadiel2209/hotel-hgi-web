// Carga el archivo .env sin librerías externas
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const archivo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env');

if (fs.existsSync(archivo)) {
  for (const linea of fs.readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || linea.trim().startsWith('#')) continue;
    let valor = m[2].trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) valor = valor.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}
