import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveAsyncLtiTestDatabase} from './lti-test-sql-guard.mjs';

function withEnv(changes,run){
 const keys=Object.keys(changes);
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  for(const [key,value] of Object.entries(changes)){
   if(value===undefined)delete process.env[key];
   else process.env[key]=value;
  }
  return run();
 }finally{
  for(const key of keys){
   if(old[key]===undefined)delete process.env[key];
   else process.env[key]=old[key];
  }
 }
}
test('real SQL test cannot run without affirmative isolated-database opt-in',()=>{
 withEnv({P2LRN_TEST_LTI_ASYNC_ENABLE:undefined,P2LRN_TEST_LTI_ASYNC_ENGINE:undefined},
  ()=>assert.equal(resolveAsyncLtiTestDatabase(),null));
 withEnv({P2LRN_TEST_LTI_ASYNC_ENABLE:'NO',P2LRN_TEST_LTI_ASYNC_ENGINE:'postgres'},
  ()=>assert.throws(resolveAsyncLtiTestDatabase,/EXPLICIT_OPT_IN/));
});
test('real SQL test refuses remote host, production database and wrong protocol',()=>{
 const vars={P2LRN_TEST_LTI_ASYNC_ENABLE:'YES',P2LRN_TEST_LTI_ASYNC_ENGINE:'postgres'};
 for(const value of [
  'postgres://user:pass@db.example.com/p2lrn_test',
  'postgres://user:pass@127.0.0.1/company_production',
  'mysql://user:pass@127.0.0.1/p2lrn_test'
 ]){
  withEnv({...vars,P2LRN_TEST_POSTGRES_URL:value},
   ()=>assert.throws(resolveAsyncLtiTestDatabase,/UNSAFE_TARGET/));
 }
 withEnv({...vars,P2LRN_TEST_POSTGRES_URL:'postgres://test:pass@127.0.0.1:5432/p2lrn_test'},
  ()=>assert.equal(resolveAsyncLtiTestDatabase().dbEngine,'postgres'));
});
