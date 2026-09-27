export class ReaderInputError extends Error {
  readonly code='P2LRN_SOURCE_READER_INPUT';
  constructor(message:string){super(message);this.name='ReaderInputError';}
}
