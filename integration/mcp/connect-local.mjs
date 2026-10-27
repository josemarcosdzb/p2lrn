#!/usr/bin/env node
import {existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline/promises';
// MCP client dependencies load only for --verify: --help and dry-run
// setup must work before the first npm installation.
import {
  LOCAL_CLIENTS, OTHER_CLIENTS, applyLocalRegistration, buildLocalClientSnippet,
  defaultCourseDirectory, listDetectedClients, localStdioDefinition,
  planLocalRegistration
} from './local-clients.mjs';

function named(name) {
  const position = process.argv.indexOf('--' + name);
  if (position < 0) return null;
  const value = process.argv[position + 1];
  if (!value || value.startsWith('--')) throw new Error('--' + name + ' requires a value');
  return value;
}

function normalizedClients(list, options = {}) {
  const values = (Array.isArray(list) ? list : String(list ?? '').split(','))
    .map(value => String(value).trim().toLowerCase()).filter(Boolean);
  if (values.includes('auto')) {
    if (values.length !== 1) throw new Error('Use auto alone, or supply explicit client names');
    return listDetectedClients(options);
  }
  const valid = new Set([...LOCAL_CLIENTS,...OTHER_CLIENTS]);
  for (const value of values) if (!valid.has(value)) throw new Error('Unknown client ' + value + ': supported ' + [...valid].join(', '));
  return [...new Set(values)];
}

export async function verifyLocalMcp(entry) {
  const [{Client},{StdioClientTransport}] = await Promise.all([
    import('@modelcontextprotocol/client'),
    import('@modelcontextprotocol/client/stdio'),
  ]);
  const client = new Client({name:'p2lrn-local-connection-check',version:'0.1.0'});
  const transport = new StdioClientTransport({
    command:entry.command,
    args:entry.args,
    env:{...process.env,...entry.env}
  });
  try {
    await client.connect(transport);
    const advertised = (await client.listTools()).tools.map(item => item.name);
    const result = await client.callTool({name:'p2lrn_list_courses',arguments:{limit:1}});
    if (result.isError) throw new Error('P2LRN tool call failed: ' + JSON.stringify(result.content));
    return {
      negotiated:true,
      tools:advertised,
      courseListingWorked:true,
      writeToolsAdvertised:advertised.some(name => name.startsWith('p2lrn_draft_')),
      transport:'stdio'
    };
  } finally { await client.close(); }
}

export async function connectLocal({
  root, clients, enableDrafts = false, install = false, createRoot = false,
  workspace, replace = false, home, appData, platform, verify = false,
  nodePath, serverPath
} = {}) {
  const effectiveRoot = resolve(root || defaultCourseDirectory({home}));
  const configOptions = {home,appData,platform,workspace};
  const selected = normalizedClients(clients ?? 'auto',configOptions);
  const autoClients = selected.filter(name => LOCAL_CLIENTS.includes(name));
  const manualClients = selected.filter(name => !LOCAL_CLIENTS.includes(name));
  if (!existsSync(effectiveRoot)) {
    if (install && createRoot) mkdirSync(effectiveRoot,{recursive:true});
    else throw new Error('The course folder does not exist: ' + effectiveRoot + '. Choose --root or use --create-root with --install.');
  }
  const entry = localStdioDefinition({root:effectiveRoot,enableDrafts,nodePath,serverPath});
  // Produce previews for every client, including those that cannot be installed
  // via local JSON files. No AI host state changes without explicit --install.
  const plans = autoClients.map(client => planLocalRegistration(client,{
    ...configOptions,root:effectiveRoot,enableDrafts,nodePath,serverPath,replace
  }));
  const manual = manualClients.map(client => ({client,config:buildLocalClientSnippet(client,entry),
    note:'Manual provider registration; this tool does not claim an app was installed'}));
  const installed = install ? autoClients.map(client => applyLocalRegistration(client,{
    ...configOptions,root:effectiveRoot,enableDrafts,nodePath,serverPath,replace
  })) : [];
  const evidence = verify ? await verifyLocalMcp(entry) : null;
  return {root:effectiveRoot,mode:enableDrafts?'drafts':'read-only',clients:selected,
    plans,installed,manual,verified:evidence,applied:installed.some(item => item.applied)};
}

function pretty(value) {
  return JSON.stringify(value,null,2);
}

async function interactive() {
  const terminal = createInterface({input:process.stdin,output:process.stdout});
  async function ask(prompt, defaultValue = '') {
    const raw = (await terminal.question(prompt)).trim();
    return raw || defaultValue;
  }
  try {
    const preferredRoot = defaultCourseDirectory();
    console.log('\nP2LRN — conexión local a cualquier IA compatible con MCP');
    console.log('No necesitas dominio, cuenta de proveedor ni servidor remoto.\n');
    const root = resolve(await ask('Carpeta de cursos [' + preferredRoot + ']: ',preferredRoot));
    const make = !existsSync(root);
    if (make) {
      const yes = await ask('La carpeta no existe. ¿Crear una carpeta nueva y vacía? [s/N]: ','n');
      if (!['s','si','sí','y','yes'].includes(yes.toLowerCase())) return {cancelled:true};
    }
    const detected = listDetectedClients();
    console.log('Clientes compatibles: ' + LOCAL_CLIENTS.join(', '));
    console.log('Detectados en tu perfil: ' + (detected.join(', ') || 'ninguno'));
    const selected = await ask('Clientes a configurar (separados por comas) [auto]: ','auto');
    const chosen = normalizedClients(selected);
    if (!chosen.length) {
      console.log('No se ha detectado ningún cliente. El modo genérico queda disponible con --clients generic.');
      return {cancelled:true,note:'No installed client detected'};
    }
    if (chosen.includes('vscode')) console.log('Para VS Code se necesita elegir un proyecto.');
    const workspace = chosen.includes('vscode') ?
      resolve(await ask('Carpeta de proyecto VS Code: ',root)) : undefined;
    const draftAnswer = await ask('¿Permitir crear y modificar borradores sin sobrescribir el original? [s/N]: ','n');
    const enableDrafts = ['s','si','sí','y','yes'].includes(draftAnswer.toLowerCase());
    console.log('\nSe configurarán: ' + chosen.join(', '));
    console.log('Solo podrán acceder a: ' + root);
    console.log('Permisos: ' + (enableDrafts?'borradores y exportaciones nuevas':'solo lectura'));
    console.log('Las configuraciones anteriores de otros MCP se conservarán y se hará copia de seguridad.');
    const confirmed = await ask('¿Instalar esta configuración en los clientes seleccionados? [s/N]: ','n');
    if (!['s','si','sí','y','yes'].includes(confirmed.toLowerCase())) return {cancelled:true};
    const output = await connectLocal({root,clients:chosen,enableDrafts,install:true,createRoot:make,workspace,verify:true});
    console.log('\nConfiguración aplicada:');
    for (const item of output.installed) console.log(' - ' + item.client + ': ' + item.status + ' (' + item.path + ')');
    console.log('MCP: ' + output.verified.tools.length + ' herramientas detectadas por conexión real.');
    console.log('Cierra y vuelve a abrir la aplicación de IA para que cargue P2LRN.');
    return output;
  } finally {
    terminal.close();
  }
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log([
      'P2LRN: un único MCP para IA local y remota',
      '',
      'Sin argumentos: asistente interactivo (recomendado).',
      'node connect-local.mjs --root C:\\P2LRN --clients claude,cursor --install --verify',
      'node connect-local.mjs --root C:\\P2LRN --clients auto --install --verify',
      'node connect-local.mjs --root C:\\P2LRN --clients generic,codex,claude-code,opencode',
      'Opciones: --workspace RUTA --enable-drafts --create-root --replace --install --verify --output RUTA',
      'Las aplicaciones web (ChatGPT/Claude/Grok) necesitan HTTPS/túnel. La conexión local usa stdio.'
    ].join('\n'));
    return;
  }
  if (process.argv.length <= 2 || process.argv.includes('--wizard')) {
    await interactive();
    return;
  }
  const root = named('root');
  const clients = named('clients') ?? (named('client') || 'auto');
  const data = await connectLocal({
    root,clients,
    workspace:named('workspace'),
    enableDrafts:process.argv.includes('--enable-drafts'),
    install:process.argv.includes('--install'),
    createRoot:process.argv.includes('--create-root'),
    replace:process.argv.includes('--replace'),
    verify:process.argv.includes('--verify'),
  });
  const output = named('output');
  if (output) {
    const destination = resolve(output);
    if (existsSync(destination)) throw new Error('Output already exists; refusing to replace ' + destination);
    mkdirSync(dirname(destination),{recursive:true});
    writeFileSync(destination,pretty(data)+'\n',{flag:'wx'});
  }
  console.log(pretty(data));
  if (!data.clients.length) console.error('No installed local clients detected. Run --wizard or choose --clients generic.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('P2LRN local setup failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  });
}
