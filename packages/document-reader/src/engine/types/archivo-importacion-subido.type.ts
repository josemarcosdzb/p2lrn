export interface ArchivoImportacionSubido {
  fieldname?: string;
  originalname: string;
  encoding?: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  path?: string;
  filename?: string;
  destination?: string;
}
