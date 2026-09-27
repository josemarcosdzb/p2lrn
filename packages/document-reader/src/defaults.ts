import {DocumentExtractorRegistry} from './registry.js';
import {markdownExtractor} from './extractors/markdown.js';
import {plainTextExtractor} from './extractors/plain-text.js';

export function createDefaultDocumentExtractorRegistry():DocumentExtractorRegistry{
  const registry=new DocumentExtractorRegistry();
  registry.register(plainTextExtractor);
  registry.register(markdownExtractor);
  return registry;
}
