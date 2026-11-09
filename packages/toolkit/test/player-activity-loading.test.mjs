import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {playerUiText} from '../web/renderers/ui-i18n.js';

test('loading text is localized without changing authored content', () => {
  const es={documentElement:{lang:'es'}}, en={documentElement:{lang:'en'}};
  assert.equal(playerUiText('Cargando actividad…',es),'Cargando actividad…');
  assert.equal(playerUiText('Cargando actividad…',en),'Loading activity…');
  assert.equal(playerUiText('La actividad está tardando más de lo habitual…',en),
    'This activity is taking longer than usual…');
  assert.equal(playerUiText('No se pudo cargar la actividad.',en),'Could not load this activity.');
  assert.equal(playerUiText('Geology course title',en),'Geology course title');
});

test('Player keeps the indicator until actual external runtime readiness, not the rendered event',async()=>{
  const source=await readFile(new URL('../web/p2lrn-player.js',import.meta.url),'utf8');
  assert.match(source,/this\.addEventListener\('p2lrn:activityready', state\.onReady\)/);
  assert.match(source,/event\.detail\?\.context\?\.entityId === entity\.id/);
  assert.match(source,/\['h5p', 'scorm', 'external-package'\]\.includes\(runtime\?\.kind\)/);
  assert.match(source,/this\.addEventListener\('p2lrn:error', state\.onError\)/);
  assert.match(source,/this\.#stopActivityLoading\(stage, waiting\)/);
  assert.match(source,/data-p2lrn-loading/);
  assert.match(source,/aria-busy/);
});

test('loading indicator is styled, responsive and respects reduced motion',async()=>{
  const css=await readFile(new URL('../web/p2lrn-player.css',import.meta.url),'utf8');
  assert.match(css,/\.p2lrn-stage\[data-p2lrn-loading="true"\]::before/);
  assert.match(css,/\.p2lrn-stage\[data-p2lrn-loading="true"\]::after/);
  assert.match(css,/@keyframes p2lrn-loading-rotate/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/data-p2lrn-loading-label/);
});
