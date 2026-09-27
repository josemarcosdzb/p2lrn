import {DocumentExtractorRegistry} from './registry.js';
import type {DocumentPostProcessor} from './contracts.js';

export function createDefaultDocumentExtractorRegistry():DocumentExtractorRegistry{
  // The mature copied canonical engine is the only default Reader authority.
  // This registry remains as an explicit extension point for third-party/custom formats.
  return new DocumentExtractorRegistry();
}

export function createDefaultDocumentPostProcessors():DocumentPostProcessor[]{return[];}
