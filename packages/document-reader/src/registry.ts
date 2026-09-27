import type {DocumentExtractor,FormatDetection} from './contracts.js';
import type {SourceDocumentFormat,SourceDocumentInput} from './types.js';

const EXTENSIONS:Record<string,SourceDocumentFormat>={
  pdf:'PDF',docx:'DOCX',pptx:'PPTX',txt:'TXT',md:'MARKDOWN',markdown:'MARKDOWN',html:'HTML',htm:'HTML',
  rtf:'RTF',tex:'TEX',xml:'XML',yaml:'YAML',yml:'YAML',csv:'CSV',xlsx:'XLSX',odt:'ODT',epub:'EPUB',
  json:'JSON',zip:'ZIP',imscc:'IMSCC',h5p:'H5P',mbz:'MOODLE_BACKUP'
};

export class BasicDocumentFormatDetector {
  detect(input:SourceDocumentInput):FormatDetection {
    const extension=input.name.toLowerCase().split('.').pop()??'';
    const format=EXTENSIONS[extension]??'UNKNOWN';
    return{format,confidence:format==='UNKNOWN'?0:0.55,extension:extension||undefined,mediaType:input.mediaType,reason:format==='UNKNOWN'?'extension not recognized':'extension hint'};
  }
}

export class DocumentExtractorRegistry {
  #byFormat=new Map<SourceDocumentFormat,DocumentExtractor[]>();
  register(extractor:DocumentExtractor):void{
    for(const format of extractor.formats){
      const list=this.#byFormat.get(format)??[];
      if(list.some(x=>x.id===extractor.id))throw new Error(`Extractor already registered for ${format}: ${extractor.id}`);
      this.#byFormat.set(format,[...list,extractor]);
    }
  }
  list(format?:SourceDocumentFormat):readonly DocumentExtractor[]{
    if(format)return[...(this.#byFormat.get(format)??[])];
    return[...new Map([...this.#byFormat.values()].flat().map(x=>[x.id,x])).values()];
  }
  require(format:SourceDocumentFormat):DocumentExtractor{
    const candidates=this.#byFormat.get(format)??[];
    if(candidates.length===0)throw new Error(`No document extractor registered for ${format}`);
    return candidates[0]!;
  }
}
