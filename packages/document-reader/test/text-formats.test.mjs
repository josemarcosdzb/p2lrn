import test from 'node:test';
import assert from 'node:assert/strict';
import {DefaultP2LRNDocumentReader} from '../dist/index.js';

const reader=()=>new DefaultP2LRNDocumentReader();
const bytes=value=>new TextEncoder().encode(value);

test('HTML preserves heading/list/table order and materializes embedded data images without fetching remote ones',async()=>{
  const html='<!doctype html><html lang="es"><head><title>Curso HTML</title><script>bad()</script></head><body><h1>1 Módulo</h1><p>Texto <strong>principal</strong>.</p><img alt="Logo" src="data:image/png;base64,iVBORw0KGgo="><ul><li>Uno</li></ul><table><tr><th>Clave</th><th>Valor</th></tr><tr><td>A</td><td>1</td></tr></table><img alt="Remota" src="https://example.invalid/x.png"></body></html>';
  const result=await reader().read({name:'curso.html',bytes:bytes(html)});
  assert.equal(result.document.metadata.title,'Curso HTML');
  assert.equal(result.document.metadata.language,'es');
  assert.deepEqual(result.document.blocks.map(x=>x.type),['TITLE','PARAGRAPH','IMAGE','LIST','TABLE','IMAGE']);
  assert.equal(result.document.blocks[0].level,1);
  assert.equal(result.document.blocks[1].text,'Texto principal.');
  assert.equal(result.assets.length,1);
  assert.equal(result.assets[0].reference.mediaType,'image/png');
  assert.equal(result.document.tables[0].rows[0].Valor,'1');
  assert.equal(result.document.warnings.length,1);
  assert.equal(result.document.blocks.at(-1).source.raw.unmaterialized,true);
});

test('CSV handles quoted delimiters and embedded newlines as one table',async()=>{
  const result=await reader().read({name:'datos.csv',bytes:bytes('Nombre,Nota,Comentario\n"A, B",10,"Línea 1\nLínea 2"\nC,8,Bien\n')});
  assert.equal(result.document.tables.length,1);
  assert.deepEqual(result.document.tables[0].columns,['Nombre','Nota','Comentario']);
  assert.equal(result.document.tables[0].rows[0].Nombre,'A, B');
  assert.equal(result.document.tables[0].rows[0].Comentario,'Línea 1\nLínea 2');
  assert.equal(result.document.tables[0].rows[1].Nota,'8');
});

test('JSON XML and YAML preserve structured source as preformatted content instead of inventing hierarchy',async()=>{
  const json=await reader().read({name:'curso.json',bytes:bytes('{"title":"JSON Course","items":[1,2]}')});
  assert.equal(json.document.metadata.title,'JSON Course');
  assert.equal(json.document.blocks[0].source.raw.preserveWhitespace,true);
  assert.equal(JSON.parse(json.document.blocks[0].text).items.length,2);

  const xml=await reader().read({name:'curso.xml',bytes:bytes('<?xml version="1.0"?><course><title>XML Course</title><item>A</item></course>')});
  assert.equal(xml.document.metadata.title,'XML Course');
  assert.match(xml.document.blocks[0].text,/<course>/);

  const yaml=await reader().read({name:'curso.yaml',bytes:bytes('title: YAML Course\nitems:\n  - uno\n  - dos\n')});
  assert.equal(yaml.document.metadata.title,'YAML Course');
  assert.match(yaml.document.blocks[0].text,/items:/);
});

test('RTF extracts readable paragraphs and flags embedded pictures instead of silently dropping them',async()=>{
  const source='{\\rtf1\\ansi Primer párrafo.\\par Segundo \\u225? texto.\\par {\\pict abcdef}}';
  const result=await reader().read({name:'curso.rtf',bytes:bytes(source)});
  assert.ok(result.document.blocks.some(x=>x.text.includes('Primer párrafo.')));
  assert.ok(result.document.blocks.some(x=>x.text.includes('Segundo á texto.')));
  assert.ok(result.document.warnings.some(x=>x.path==='rtf.pict'));
});

test('TeX maps section depth and list items while reporting external graphics',async()=>{
  const source='\\section{Módulo Uno}\nTexto introductorio.\n\n\\subsection{Lección A}\n\\begin{itemize}\n\\item Primero\n\\item Segundo\n\\end{itemize}\n\\includegraphics{figura.png}';
  const result=await reader().read({name:'curso.tex',bytes:bytes(source)});
  assert.deepEqual(result.document.blocks.filter(x=>x.type==='TITLE').map(x=>[x.level,x.text]),[[1,'Módulo Uno'],[2,'Lección A']]);
  assert.deepEqual(result.document.blocks.filter(x=>x.type==='LIST').map(x=>x.text),['Primero','Segundo']);
  assert.ok(result.document.warnings.some(x=>x.path==='tex.includegraphics'));
});

test('malformed JSON CSV and RTF fail explicitly',async()=>{
  await assert.rejects(()=>reader().read({name:'bad.json',bytes:bytes('{bad')}),/JSON cannot be parsed/);
  await assert.rejects(()=>reader().read({name:'bad.csv',bytes:bytes('A,B\n"unterminated')}),/unterminated quoted field/);
  await assert.rejects(()=>reader().read({name:'bad.rtf',bytes:bytes('plain text')}),/RTF header is missing/);
});
