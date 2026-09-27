import {readFileSync, writeFileSync} from 'node:fs';

const schemaUrl = new URL('../../../schemas/project.schema.json', import.meta.url);
const outputUrl = new URL('../src/core/creator-project-schema.ts', import.meta.url);
const schema = JSON.parse(readFileSync(schemaUrl, 'utf8'));
const generated = `// Generated from schemas/project.schema.json. Do not edit by hand.\nexport const CREATOR_PROJECT_SCHEMA_030: any = ${JSON.stringify(schema)};\n`;

if (process.argv.includes('--check')) {
  const current = readFileSync(outputUrl, 'utf8');
  if (current !== generated) {
    process.stderr.write('creator-project-schema.ts is stale. Run npm run generate:creator-schema.\n');
    process.exitCode = 1;
  }
} else {
  writeFileSync(outputUrl, generated);
}
