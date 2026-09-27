import {DocumentExtractorRegistry} from './registry.js';
import {docxExtractor} from './extractors/docx.js';
import {pptxExtractor} from './extractors/pptx.js';
import type {DocumentPostProcessor} from './contracts.js';

export function createDefaultDocumentExtractorRegistry():DocumentExtractorRegistry{
  const registry=new DocumentExtractorRegistry();
  // Temporary fallbacks only until the matching mature canonical extractors
  // are ported from the pinned source Reader.
  registry.register(docxExtractor);
  registry.register(pptxExtractor);
  return registry;
}

export function createDefaultDocumentPostProcessors():DocumentPostProcessor[]{return[];}
