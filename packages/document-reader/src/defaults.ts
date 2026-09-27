import {DocumentExtractorRegistry} from './registry.js';
import {markdownExtractor} from './extractors/markdown.js';
import {plainTextExtractor} from './extractors/plain-text.js';
import {docxExtractor} from './extractors/docx.js';
import {pptxExtractor} from './extractors/pptx.js';
import {questionSemanticPostProcessor} from './questions.js';
import {csvExtractor,htmlExtractor,jsonExtractor,rtfExtractor,texExtractor,xmlExtractor,yamlExtractor} from './extractors/text-structured.js';
import type {DocumentPostProcessor} from './contracts.js';

export function createDefaultDocumentExtractorRegistry():DocumentExtractorRegistry{
  const registry=new DocumentExtractorRegistry();
  registry.register(plainTextExtractor);
  registry.register(markdownExtractor);
  registry.register(docxExtractor);
  registry.register(pptxExtractor);
  for(const extractor of [htmlExtractor,jsonExtractor,xmlExtractor,yamlExtractor,csvExtractor,rtfExtractor,texExtractor])registry.register(extractor);
  return registry;
}

export function createDefaultDocumentPostProcessors():DocumentPostProcessor[]{return[questionSemanticPostProcessor];}
