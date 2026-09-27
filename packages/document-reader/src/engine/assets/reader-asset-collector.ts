import {createHash} from 'node:crypto';
import {BinaryImageDetectorService} from './binary-image-detector.service.js';
import {ZipEmbeddedImageExtractorService} from './zip-embedded-image-extractor.service.js';
import type {StoredExtractedImageAsset} from './reader-assets.types.js';
import type {MaterializedAsset} from '../../types.js';

export class ReaderAssetCollector{
  readonly detector:BinaryImageDetectorService;
  readonly zip:ZipEmbeddedImageExtractorService;
  #stored:StoredExtractedImageAsset[]=[];
  #materialized:MaterializedAsset[]=[];
  constructor(){
    this.detector=new BinaryImageDetectorService();
    this.zip=new ZipEmbeddedImageExtractorService(this.detector);
  }
  reset(){this.#stored=[];this.#materialized=[];}
  materialized():MaterializedAsset[]{return this.#materialized.map(item=>({reference:{...item.reference},bytes:new Uint8Array(item.bytes)}));}
  async extraerYGuardarAssets(params:{usuarioId?:number;buffer:Buffer;mimeType:string;nombreArchivo:string;includeDataUrl:boolean;maxImages:number;packageHint?:'DOCUMENT'|'SCORM'|'IMSCC'|'GENERIC_ZIP';runOcr?:boolean;forceOcr?:boolean;}):Promise<StoredExtractedImageAsset[]>{
    const raw=await this.zip.extractImages({buffer:params.buffer,maxImages:params.maxImages,packageHint:params.packageHint});
    const stored:StoredExtractedImageAsset[]=raw.map((item,index)=>{
      const id=String(index+1);
      const digest=createHash('sha256').update(item.buffer).digest('hex');
      const asset:StoredExtractedImageAsset={
        id,name:item.originalName,mimeType:item.mimeType,size:item.buffer.byteLength,ext:item.extension,
        archivo:{id:index+1,url:`memory://p2lrn-reader/${digest}`,nombre:item.originalName,mimeType:item.mimeType,tamanoBytes:item.buffer.byteLength},
        source:{...item.source},
        ...(params.includeDataUrl?{dataUrl:`data:${item.mimeType};base64,${item.buffer.toString('base64')}`}:{})
      };
      this.#materialized.push({reference:{id,name:item.originalName,mediaType:item.mimeType,size:item.buffer.byteLength,byteDigest:'sha256:'+digest,sourcePath:item.source.path,page:item.source.page,slide:item.source.slide},bytes:new Uint8Array(item.buffer)});
      return asset;
    });
    this.#stored=stored;
    return stored;
  }
}
