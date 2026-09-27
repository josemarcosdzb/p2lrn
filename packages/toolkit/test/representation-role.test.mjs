import test from 'node:test';
import assert from 'node:assert/strict';
import {representationRoleRank} from '../web/p2lrn-player.js';

test('default representation ranking keeps primary above accessible',()=>{
  assert.ok(representationRoleRank({role:'primary'})>representationRoleRank({role:'accessible'}));
});

test('explicit preferred representation role overrides default ranking for that consumer',()=>{
  const primary=representationRoleRank({role:'primary'},'accessible');
  const accessible=representationRoleRank({role:'accessible'},'accessible');
  assert.ok(accessible>primary);
});

test('preferred role is generic and does not hardcode accessibility',()=>{
  assert.ok(representationRoleRank({role:'fallback'},'fallback')>representationRoleRank({role:'primary'},'fallback'));
});
