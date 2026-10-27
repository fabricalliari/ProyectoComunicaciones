import fs from 'node:fs/promises';
import path from 'node:path';

// Root assets come from main; the experiment is placed in its own URL folder.
const production = path.resolve('stable-site/dist');
const experiment = path.resolve('dist');
const output = path.resolve('.pages-site');
await fs.access(path.join(production, 'index.html'));
await fs.access(path.join(experiment, 'alta-frecuencia.html'));
async function copyContents(from, to) {
  for (const entry of await fs.readdir(from)) await fs.cp(path.join(from, entry), path.join(to, entry), { recursive: true, errorOnExist: true, force: false });
}
await fs.mkdir(output); // A fresh directory prevents stale files from entering the artifact.
await copyContents(production, output);
const preview = path.join(output, 'alta-frecuencia');
await fs.mkdir(preview);
await copyContents(experiment, preview);
console.log('Sitio preparado: raíz de main + prueba en /alta-frecuencia/alta-frecuencia.html');
