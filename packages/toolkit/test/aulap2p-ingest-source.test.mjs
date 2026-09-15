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

test('AulaP2P canonical ingest records an official transformation report and restores the exact source bytes',()=>{
  const dir=mkdtempSync(join(tmpdir(),'p2lrn-aulap2p-source-'));
  try{
    const input=join(dir,'reader-output.json');
    const source=join(dir,'source.pdf');
    const output=join(dir,'course.p2lrn');
    const recovered=join(dir,'recovered.pdf');
    const sourceBytes=Buffer.from('%PDF-1.4\n% P2LRN deterministic source fixture\n1 0 obj<<>>endobj\n%%EOF\n','utf8');
    writeFileSync(source,sourceBytes);
    const document={
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
    writeFileSync(input,JSON.stringify(document,null,2)+'\n');

    const result=ingestAulaP2PReader(input,output,{sourceFile:source,strictProfiles:true});
    assert.equal(result.ingestion,'aulap2p-reader');
    assert.equal(result.sourcePreserved,true);

    const reader=new P2LRNReader(output,{strictProfiles:true,validateProfilePayloads:true});
    const report=reader.transformationReport();
    assert.ok(report);
    assert.equal(report.version,'0.4.0');
    assert.equal(report.source.adapter,'AulaP2PReaderAdapter');
    assert.equal(report.source.documentSchema,'aulap2p.documento.extraido.v2');
    assert.equal(report.source.preservation,'bit-exact');
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
