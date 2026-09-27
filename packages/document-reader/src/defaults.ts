import {DocumentExtractorRegistry} from './registry.js';
import {markdownExtractor} from './extractors/markdown.js';
import {plainTextExtractor} from './extractors/plain-text.js';
import {docxExtractor} from './extractors/docx.js';
import {pptxExtractor} from './extractors/pptx.js';
import {questionSemanticPostProcessor} from './questions.js';
import type {DocumentPostProcessor} from './contracts.js';

export function createDefaultDocumentExtractorRegistry():DocumentExtractorRegistry{
  const registry=new DocumentExtractorRegistry();
  registry.register(plainTextExtractor);
  registry.register(markdownExtractor);
  registry.register(docxExtractor);
  registry.register(pptxExtractor);
  return registry;
}

export function createDefaultDocumentPostProcessors():DocumentPostProcessor[]{return[questionSemanticPostProcessor];}
