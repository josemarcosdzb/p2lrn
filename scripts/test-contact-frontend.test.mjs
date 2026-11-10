import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const script=await readFile(new URL('../deploy/netlify/site/assets/contact/contact-form.js',import.meta.url),'utf8');

function contactHarness({language='es',config={sitekey:'public-site-key',required:true},
 configOk=true,postStatus=200,formExists=true}={}){
 const calls=[],state={status:'',submitted:false,resets:0,challengeRenders:0,tokenUsed:''};
 const button={disabled:false,before(){}};
 const form={
  dataset:{},
  elements:{
   name:{value:'Test Contact'},email:{value:'contact@example.invalid'},
   subject:{value:'A question'},message:{value:'My test message is long enough'},
   company:{value:''}
  },
  querySelector(selector){
   if(selector==='[data-form-status]')return status;
   if(selector==='button[type="submit"]')return button;
   throw new Error('Unexpected form selector '+selector);
  },
  addEventListener(event,callback){if(event==='submit')state.onSubmit=callback},
  reset(){state.resets++}
 };
 const status={set textContent(value){state.status=value},get textContent(){return state.status}};
 const window={turnstile:{
  render(_target,handlers){
   state.challengeRenders++;
   handlers.callback('verified-contact-token');
   return 7;
  },reset(){state.challengeResets=(state.challengeResets??0)+1}
 }};
 const document={
  documentElement:{lang:language},
  querySelectorAll(selector){
   assert.equal(selector,'[data-contact-form]');
   return formExists?[form]:[];
  },
  createElement(){return {}},
  head:{append(scriptEl){if(scriptEl.src)scriptEl.onload?.()}}
 };
 const storage=new Map();
 const localStorage={
  getItem(key){return storage.get(key)??null},
  setItem(key,value){storage.set(key,value)}
 };
 const location={pathname:language==='en'?'/en/contact/':'/contacto/'};
 const fetch=async(url,options)=>{
  const text=String(url);
  if(text.endsWith('?config=1')){
   calls.push({type:'config',url:text});
   return {ok:configOk,json:async()=>config};
  }
  calls.push({type:'post',url:text,options});
  if(options?.method!=='POST')throw new Error('Unexpected non-POST submission');
  state.tokenUsed=JSON.parse(options.body).turnstileToken??'';
  return {ok:postStatus>=200&&postStatus<300,status:postStatus};
 };
 runInNewContext(script,{document,window,localStorage,location,fetch,console},{timeout:1500});
 return {calls,state,async submit(){
  if(!formExists)throw new Error('No form');
  await state.onSubmit({preventDefault(){}});
 }};
}

test('Spanish contact form uses only its isolated script and keeps Turnstile verification',async()=>{
 const app=contactHarness();
 await app.submit();
 assert.deepEqual(app.calls.map(c=>c.type),['config','post']);
 assert.equal(app.state.tokenUsed,'verified-contact-token');
 assert.equal(app.state.status,'Mensaje enviado. Gracias por contactar.');
 assert.equal(app.state.challengeRenders,1);
 assert.equal(app.state.resets,1);
});
test('English contact form uses the same asset and localized form feedback',async()=>{
 const app=contactHarness({language:'en'});
 await app.submit();
 assert.equal(app.state.status,'Message sent. Thank you for contacting us.');
 assert.equal(app.state.tokenUsed,'verified-contact-token');
 assert.equal(app.calls.filter(c=>c.type==='post').length,1);
});
test('empty non-contact page performs no Supabase request',()=>{
 const app=contactHarness({formExists:false});
 assert.equal(app.calls.length,0);
});
test('failed CAPTCHA configuration blocks the submission in both languages',async()=>{
 for(const language of ['es','en']){
  const app=contactHarness({language,configOk:false});
  await app.submit();
  assert.equal(app.calls.filter(c=>c.type==='post').length,0);
  assert.match(app.state.status,/verificación|verification/i);
 }
});
test('English form reports quota errors without claiming success',async()=>{
 const app=contactHarness({language:'en',postStatus:429});
 await app.submit();
 assert.equal(app.state.status,'Submission limit reached. Please try again later.');
 assert.equal(app.state.resets,0);
});
