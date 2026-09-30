import {mkdir, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {P2LRNAuthoringWorkspace} from '@p2lrn/toolkit/authoring';

const outputRoot = resolve(process.argv[2] ?? './p2lrn-example-output');
const workspaceRoot = join(outputRoot, 'workspace');
const materialRoot = join(outputRoot, 'materials');

await mkdir(materialRoot, {recursive:true});

const introFile = join(materialRoot, 'intro.html');
const practiceFile = join(materialRoot, 'practice.html');

await writeFile(introFile, `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<title>Introducción</title>
<main>
  <h1>Introducción a P2LRN</h1>
  <p>Este recurso forma parte de un paquete creado con la API pública de autoría.</p>
</main>
`);

await writeFile(practiceFile, `<!doctype html>
<html lang="es">
<meta charset="utf-8">
<title>Práctica</title>
<main>
  <h1>Práctica</h1>
  <p>Segundo recurso del curso para demostrar estructura y progresión.</p>
</main>
`);

const workspace = P2LRNAuthoringWorkspace.create(workspaceRoot, {
  title:'Curso real de ejemplo P2LRN',
  language:'es',
  description:'Ejemplo mínimo pero completo de creación, recursos, progresión y build.',
  force:true,
});

workspace.addUnit({
  key:'unidad-1',
  title:'Unidad 1 · Fundamentos',
});

workspace.addFile({
  source:introFile,
  key:'intro',
  title:'Introducción',
  parent:'unidad-1',
  mediaType:'text/html',
});

workspace.addFile({
  source:practiceFile,
  key:'practica',
  title:'Práctica',
  parent:'unidad-1',
  mediaType:'text/html',
});

workspace.setProgression('act-intro', {
  required:true,
  gateFollowing:true,
  completionRequirement:'viewed',
});

workspace.setProgression('act-practica', {
  required:true,
  completionRequirement:'completed',
});

workspace.addUrl({
  url:'https://p2lrn.netlify.app/docs/',
  key:'documentacion',
  title:'Documentación P2LRN',
  parent:'unidad-1',
});

const outputPackage = join(outputRoot, 'curso-ejemplo.p2lrn');
const result = workspace.build(outputPackage, {strictProfiles:true});

console.log(JSON.stringify({
  package:outputPackage,
  workspace:workspace.summary(),
  build:result,
}, null, 2));
