import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ingestAulaP2PReader} from '../dist/creator/aulap2p-ingest.js';
import {P2LRNReader} from '../dist/reader/index.js';
import {extractPreservedSource} from '../dist/tools/extract-source.js';

function sha256Hex(data){return createHash('sha256').update(data).digest('hex');}

function canonicalDocument(){
  return {
    version:'aulap2p.documento.extraido.v2',
    origen:{
      nombreArchivo:'source.pdf',
      tipoArchivoDetectado:'PDF',
      estrategiaExtraccion:'NATIVE'
    },
    metadatos:{
      tituloDetectado:'Curso de prueba AulaP2P',
      idiomaDetectado:'es'
    },
    procedenciaExtraccion:{motorAutoritativo:'NATIVE'},
    bloques:[],
    tablas:[],
    advertencias:[],
    secuenciaMultimodal:{
      version:'aulap2p.documento.multimodal.v2',
      nodos:[{id:'node-1',tipo:'PARRAFO',orden:1,texto:'Contenido canónico de prueba.'}]
    }
  };
}

test('AulaP2P canonical ingest records a conformant report and restores exact original source bytes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-aulap2p-source-'));
  try{
    const input=join(dir,'reader-output.json');
    const source=join(dir,'source.pdf');
    const output=join(dir,'course.p2lrn');
    const recovered=join(dir,'recovered.pdf');
    const sourceBytes=Buffer.from('%PDF-1.4\n% P2LRN deterministic source fixture\n1 0 obj<<>>endobj\n%%EOF\n','utf8');
    writeFileSync(source,sourceBytes);
    writeFileSync(input,JSON.stringify(canonicalDocument(),null,2)+'\n');

    const result=ingestAulaP2PReader(input,output,{sourceFile:source,strictProfiles:true});
    assert.equal(result.ingestion,'aulap2p-reader');
    assert.equal(result.sourcePreserved,true);
    assert.equal(result.canonicalSourcePreserved,false);

    const reader=new P2LRNReader(output,{strictProfiles:true,validateProfilePayloads:true});
    const report=reader.transformationReport();
    assert.ok(report);
    assert.equal(report.version,'0.4.0');
    assert.equal(report.source.format,'PDF');
    assert.equal(report.source.fileName,'source.pdf');
    assert.equal(report.source.preservation,'bit-exact');
    assert.equal(report.fidelity.sourceBytes,'exact');
    assert.equal(report.fidelity.runtimeSemantics,'projected');
    assert.equal(Object.prototype.hasOwnProperty.call(report,'rules'),false);
    assert.deepEqual(Object.keys(report.source).sort(),[
      'byteDigest',
      'fileName',
      'format',
      'preservation',
      'preservedPackageDigest',
      'preservedPath'
    ]);

    const digest=sha256Hex(sourceBytes);
    assert.equal(report.source.byteDigest,`sha256:${digest}`);
    assert.equal(report.source.preservedPackageDigest,`sha256:${digest}`);
    assert.equal(report.source.preservedPath,`assets/sha256/${digest.slice(0,2)}/${digest.slice(2,4)}/${digest}`);
    assert.equal(report.target.entrypoint,reader.primaryEntrypoint().id);
    assert.ok(report.mappings.some((m)=>m.operation==='preserved'&&m.targetType==='representation'));

    const sourceRepresentations=[...reader.representations.values()].map((x)=>x.representation).filter((rep)=>rep.role==='source');
    assert.equal(sourceRepresentations.length,1);
    assert.equal(sourceRepresentations[0].location.type,'embedded');
    assert.equal(sourceRepresentations[0].location.path,report.source.preservedPath);

    const extraction=extractPreservedSource(output,recovered);
    assert.equal(extraction.preservation,'bit-exact');
    assert.equal(extraction.digest,`sha256:${digest}`);
    assert.deepEqual(readFileSync(recovered),sourceBytes);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});

test('AulaP2P canonical ingest without source file preserves a normalized canonical document',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-aulap2p-canonical-'));
  try{
    const input=join(dir,'reader-output.json');
    const output=join(dir,'course.p2lrn');
    const recovered=join(dir,'recovered.json');
    const document=canonicalDocument();
    writeFileSync(input,JSON.stringify(document,null,2)+'\n');

    const result=ingestAulaP2PReader(input,output,{strictProfiles:true});
    assert.equal(result.ingestion,'aulap2p-reader');
    assert.equal(result.sourcePreserved,false);
    assert.equal(result.canonicalSourcePreserved,true);

    const reader=new P2LRNReader(output,{strictProfiles:true,validateProfilePayloads:true});
    const report=reader.transformationReport();
    assert.ok(report);
    assert.equal(report.source.format,'aulap2p.documento.extraido.v2');
    assert.equal(report.source.preservation,'normalized-subpackage');
    assert.equal(report.source.normalizedFromRoot,'$');
    assert.equal(report.fidelity.sourceBytes,'normalized');
    assert.equal(report.fidelity.runtimeSemantics,'projected');

    const sourceRepresentations=[...reader.representations.values()].map((x)=>x.representation).filter((rep)=>rep.role==='source');
    assert.equal(sourceRepresentations.length,1);
    assert.equal(sourceRepresentations[0].location.type,'embedded');
    assert.equal(sourceRepresentations[0].location.path,report.source.preservedPath);

    const extraction=extractPreservedSource(output,recovered);
    assert.equal(extraction.preservation,'normalized-subpackage');
    assert.equal(extraction.digest,report.source.preservedPackageDigest);
    assert.deepEqual(JSON.parse(readFileSync(recovered,'utf8')),document);
  }finally{
    rmSync(dir,{recursive:true,force:true});
  }
});
