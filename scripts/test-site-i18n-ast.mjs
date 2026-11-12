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

test('visits nested object navigation labels while preserving their technical keys',()=>{
  const tree=parseJs("const nav=[{label:'Soluciones',items:[['/docs/','Documentación']]}];");
  const values=[];
  walkAst(tree,(node,parent)=>{
    if(node.type==='Literal'&&typeof node.value==='string'&&!structuralLiteral(node,parent))values.push(node.value);
  });
  assert.deepEqual(values,['Soluciones','/docs/','Documentación']);
});

// Actual Studio game identifiers are executable contracts, not translated interface text.
test('English Studio uses exactly the same game-kind routing as Spanish Studio',async()=>{
  const {readFile}=await import('node:fs/promises');
  const [es,en]=await Promise.all([
    readFile(new URL('../deploy/netlify/site/studio/studio.js',import.meta.url),'utf8'),
    readFile(new URL('../deploy/netlify/site/en/studio/studio.js',import.meta.url),'utf8')
  ]);
  function gameKinds(source){
    let kinds=null;
    walkAst(parseJs(source),(node)=>{
      if(node.type!=='CallExpression'||node.callee?.type!=='MemberExpression'||
        node.callee.property?.name!=='includes'||node.callee.object?.type!=='ArrayExpression'||
        node.arguments?.[0]?.name!=='kind')return;
      const values=node.callee.object.elements.map(item=>item?.value);
      if(values.includes('memory')&&values.includes('3d'))kinds=values;
    });
    return kinds;
  }
  const sourceKinds=gameKinds(es),englishKinds=gameKinds(en);
  assert.ok(sourceKinds?.includes('rosco'),'Source must include the rosco renderer');
  assert.deepEqual(englishKinds,sourceKinds,'English UI may translate labels but never renderer identifiers');
});
