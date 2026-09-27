import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import {DefaultP2LRNDocumentReader} from '../dist/index.js';

async function bytes(zip){return new Uint8Array(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));}

test('XLSX preserves workbook sheet order, shared strings, sparse cells and formulas',async()=>{
  const zip=new JSZip();
  zip.file('xl/workbook.xml','<workbook xmlns:r="r"><sheets><sheet name="Primera" sheetId="1" r:id="rId1"/><sheet name="Oculta" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/sharedStrings.xml','<sst><si><t>Nombre</t></si><si><t>Nota</t></si><si><t>Ana</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml','<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><f>SUM(4,6)</f><v>10</v></c></row></sheetData></worksheet>');
  zip.file('xl/worksheets/sheet2.xml','<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Clave</t></is></c><c r="C1" t="inlineStr"><is><t>Valor</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>X</t></is></c><c r="C2"><v>2</v></c></row></sheetData></worksheet>');
  const result=await new DefaultP2LRNDocumentReader().read({name:'libro.xlsx',bytes:await bytes(zip)});
  assert.deepEqual(result.document.metadata.sheets,['Primera','Oculta']);
  assert.deepEqual(result.document.blocks.map(x=>[x.sheet,x.text]),[['Primera','Primera'],['Oculta','Oculta']]);
  assert.deepEqual(result.document.tables[0].columns,['Nombre','Nota']);
  assert.equal(result.document.tables[0].rows[0].Nombre,'Ana');
  assert.equal(result.document.tables[0].rows[0].Nota,'=SUM(4,6)');
  assert.deepEqual(result.document.tables[1].columns,['Clave','Columna 2','Valor']);
  assert.equal(result.document.tables[1].rows[0].Valor,'2');
  assert.equal(result.document.tables[1].source.raw.hidden,true);
  assert.ok(result.document.warnings.some(x=>x.path==='xlsx.formatting'));
});

test('XLSX reports missing worksheet relationships instead of guessing sheet files',async()=>{
  const zip=new JSZip();
  zip.file('xl/workbook.xml','<workbook xmlns:r="r"><sheets><sheet name="Sin relación" r:id="missing"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<Relationships/>');
  const result=await new DefaultP2LRNDocumentReader().read({name:'broken.xlsx',bytes:await bytes(zip)});
  assert.equal(result.document.tables.length,0);
  assert.ok(result.document.warnings.some(x=>/relationship is missing/.test(x.message)));
});
