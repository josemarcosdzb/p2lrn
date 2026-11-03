import test from 'node:test';
import assert from 'node:assert/strict';
import {parseJs,walkAst,structuralLiteral} from './site-i18n-ast.mjs';

test('reaches deeply nested visible literals, not only array child nodes',()=>{
  const ast=parseJs("const labels={LOADING:'CARGANDO'}; function show(){throw new Error('Introduce una URL de paquete.')} document.title='Cuestionarios y juegos';");
  const strings=[];
  walkAst(ast,(node,parent)=>{
    if(node.type==='Literal'&&typeof node.value==='string'&&!structuralLiteral(node,parent))strings.push(node.value);
  });
  assert.deepEqual(strings,['CARGANDO','Introduce una URL de paquete.','Cuestionarios y juegos']);
});
test('keeps technical object keys and module specifiers outside translation',()=>{
  const values=[];
  walkAst(parseJs("import x from './runtime.js'; const labels={'LOADING':'CARGANDO'};"),(node,parent)=>{
    if(node.type==='Literal'&&typeof node.value==='string'&&!structuralLiteral(node,parent))values.push(node.value);
  });
  assert.deepEqual(values,['CARGANDO']);
});
test('includes template quasis but does not follow non-AST data',()=>{
  const chunks=[];
  walkAst(parseJs("const label=`Revisando ${name}... resultado`;"),node=>{
    if(node.type==='TemplateElement')chunks.push(node.value.raw);
  });
  assert.deepEqual(chunks,['Revisando ','... resultado']);
});
