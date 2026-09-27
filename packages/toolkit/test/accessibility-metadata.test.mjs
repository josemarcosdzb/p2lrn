import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCESSIBILITY_METADATA_VERSION,createAccessibilityMetadata,validateAccessibilityMetadata} from '../dist/core/index.js';

test('accessibility metadata preserves schema.org vocabulary values without claiming conformance',()=>{
  const metadata=createAccessibilityMetadata({
    accessMode:['textual','visual','textual'],
    accessModeSufficient:[['textual'],['visual','textual'],['textual','visual']],
    accessibilityFeature:['alternativeText','structuralNavigation'],
    accessibilityHazard:['noFlashingHazard','noMotionSimulationHazard'],
    accessibilityControl:['fullKeyboardControl'],
    accessibilityAPI:['ARIA'],
    accessibilitySummary:'Texto alternativo y navegación estructurada disponibles.'
  });
  assert.equal(metadata.version,ACCESSIBILITY_METADATA_VERSION);
  assert.deepEqual(metadata.accessMode,['textual','visual']);
  assert.deepEqual(metadata.accessModeSufficient,[['textual'],['visual','textual']]);
  assert.deepEqual(metadata.accessibilityFeature,['alternativeText','structuralNavigation']);
  assert.equal(metadata.accessibilitySummary,'Texto alternativo y navegación estructurada disponibles.');
  assert.deepEqual(validateAccessibilityMetadata(metadata),metadata);
  assert.equal('wcagConformant' in metadata,false);
});

test('accessibility metadata rejects empty values and control characters',()=>{
  assert.throws(()=>createAccessibilityMetadata({accessibilityFeature:[]}),/At least one/);
  assert.throws(()=>createAccessibilityMetadata({accessibilityFeature:['']}),/must not be empty/);
  assert.throws(()=>createAccessibilityMetadata({accessibilitySummary:'   '}),/must not be empty/);
  assert.throws(()=>createAccessibilityMetadata({accessMode:['textual\u0000']}),/control characters/);
  assert.throws(()=>createAccessibilityMetadata({accessibilityFeatures:['alternativeText']}),/Unsupported accessibility metadata field: accessibilityFeatures/);
  assert.throws(()=>validateAccessibilityMetadata({version:'1',accessibilityFeature:['alternativeText'],wcag:'AA'}),/Unsupported accessibility metadata field: wcag/);
});

test('accessModeSufficient groups are order-insensitive for duplicate elimination',()=>{
  const metadata=createAccessibilityMetadata({accessModeSufficient:[['visual','textual'],['textual','visual'],['auditory']]});
  assert.deepEqual(metadata.accessModeSufficient,[['visual','textual'],['auditory']]);
});
