import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

// Ejecutar desde la sesión del propietario del equipo. Usa la autenticación
// normal de Git y mantiene la credencial de API solamente en memoria.
const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = 'fabricalliari/ProyectoComunicaciones';
const origin = `https://github.com/${repo}.git`;
const base = `/repos/${repo}`;
const safeDirectory = checkout.replaceAll('\\', '/');
let token;

function git(args, { capture = true, input, nonInteractive = false } = {}) {
  const result = spawnSync('git', ['-c', `safe.directory=${safeDirectory}`, '-c', 'http.sslBackend=openssl', ...args], {
    cwd: checkout, encoding: 'utf8', input,
    stdio: capture ? 'pipe' : 'inherit',
    env: nonInteractive ? { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' } : process.env,
    timeout: args[0] === 'push' ? 300000 : 30000,
  });
  if (result.error || result.status !== 0) throw new Error(`No se pudo completar git ${args[0]}. Revisá la autenticación y los permisos del repositorio.`);
  return result.stdout?.trim() || '';
}

async function api(route, { method = 'GET', body, allow404 = false } = {}) {
  const response = await fetch(`https://api.github.com${route}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'ProyectoComunicaciones-Pages',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub devolvió HTTP ${response.status}. Revisá los permisos de escritura y administración de Pages.`);
  return response.status === 204 ? null : response.json();
}

async function main() {
  if (git(['remote', 'get-url', 'origin']) !== origin) throw new Error('El remoto no coincide con el repositorio solicitado. No se publicó nada.');
  if (git(['branch', '--show-current']) !== 'main') throw new Error('La publicación espera la rama main.');
  if (git(['status', '--porcelain'])) throw new Error('Hay cambios sin commit. Revisalos y confirmalos antes de publicar.');
  const commit = git(['rev-parse', 'HEAD']);
  console.log(`Repositorio: ${repo}\nCommit: ${commit}`);
  if (process.argv.includes('--check')) {
    console.log('Preparación local correcta. No se subió código ni se modificó GitHub.');
    return;
  }

  console.log('Subiendo main. Si Git solicita iniciar sesión, completá el acceso en GitHub.');
  git(['push', '-u', 'origin', 'main'], { capture: false });
  token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    const raw = git(['-c', 'credential.interactive=false', 'credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n', nonInteractive: true,
    });
    token = raw.split(/\r?\n/).find(line => line.startsWith('password='))?.slice('password='.length);
  }
  if (!token) throw new Error('El código se subió, pero no se pudo obtener acceso a la API. Habilitá Settings > Pages > GitHub Actions y ejecutá el workflow pages.yml.');

  const current = await api(`${base}/pages`, { allow404: true });
  if (!current) await api(`${base}/pages`, { method: 'POST', body: { build_type: 'workflow' } });
  else if (current.build_type !== 'workflow') await api(`${base}/pages`, { method: 'PUT', body: { build_type: 'workflow' } });

  const requested = Date.now();
  await api(`${base}/actions/workflows/pages.yml/dispatches`, { method: 'POST', body: { ref: 'main' } });
  console.log('GitHub Pages habilitado. Esperando las pruebas y el despliegue...');
  let run;
  for (let attempt = 0; attempt < 80; attempt++) {
    const runs = await api(`${base}/actions/workflows/pages.yml/runs?event=workflow_dispatch&per_page=10`);
    run = runs.workflow_runs.find(item => item.head_sha === commit && Date.parse(item.created_at) >= requested - 5000);
    if (run?.status === 'completed') break;
    if (attempt % 4 === 0) console.log(run ? `Estado: ${run.status}` : 'Esperando el inicio del workflow...');
    await delay(7500);
  }
  if (run?.conclusion !== 'success') throw new Error(`El despliegue todavía no terminó correctamente. Revisá https://github.com/${repo}/actions`);
  const pages = await api(`${base}/pages`);
  if (!pages.html_url?.startsWith('https://')) throw new Error('GitHub no devolvió una dirección HTTPS.');
  const url = new URL(pages.html_url);
  if (url.origin !== 'https://fabricalliari.github.io' || url.pathname.replace(/\/$/, '') !== '/ProyectoComunicaciones') throw new Error('La dirección devuelta no coincide con el sitio esperado.');
  let served = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (response.ok && (await response.text()).includes('SonicDrop')) { served = true; break; }
    await delay(5000);
  }
  if (!served) throw new Error('El workflow terminó, pero la web todavía no respondió correctamente. Volvé a comprobarla en unos minutos.');
  fs.writeFileSync(path.resolve(checkout, '../Estado-publicacion.json'), JSON.stringify({
    repository: repo, commit, url: url.href, workflow: run.html_url,
    status: 'succeeded', verified_at: new Date().toISOString(),
  }, null, 2));
  console.log(`Publicación verificada: ${url.href}`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => { token = undefined; });
