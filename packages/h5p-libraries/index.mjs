import {fileURLToPath} from 'node:url';

export const H5P_LIBRARIES_PACKAGE_VERSION = '0.5.0-alpha.9';
export const H5P_LIBRARY_SOURCE = Object.freeze({
  repository: 'Lumieducation/Lumi',
  commit: '236912f8e3c07a6b5c7ece4930b98fec2b6d3f6a',
  basePath: 'assets/h5p/libraries',
});

export const h5pLibrariesPath = fileURLToPath(new URL('./dist/', import.meta.url));
