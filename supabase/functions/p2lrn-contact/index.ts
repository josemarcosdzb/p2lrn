const ALLOWED_ORIGINS=new Set(['https://p2lrn.org','https://p2lrn.netlify.app']);
const PROJECT_URL=Deno.env.get('SUPABASE_URL')||'';
const SERVICE_KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
// Turnstile can be enforced when the sitekey and secret have been installed.
// Never rely on browser-only CAPTCHA checks: the secret stays in Supabase.
const TURNSTILE_SECRET_KEY=Deno.env.get('TURNSTILE_SECRET_KEY')||'';
const TURNSTILE_REQUIRED=Deno.env.get('TURNSTILE_REQUIRED')==='true';
async function verifyTurnstile(token:string,hostname:string){
 if(!TURNSTILE_SECRET_KEY)return !TURNSTILE_REQUIRED;
 if(typeof token!=='string'||token.length<1||token.length>2048)return false;
 try{
  const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({secret:TURNSTILE_SECRET_KEY,response:token}),
   signal:AbortSignal.timeout(8000),
  });
  if(!response.ok)return false;
  const result=await response.json();
  return result?.success===true&&result.hostname===hostname&&result.action==='contact';
 }catch{return false}
}
const baseHeaders={'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'content-type, apikey, authorization','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Type':'application/json; charset=utf-8'};

async function hash(value:string){const data=new TextEncoder().encode(value);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(n=>n.toString(16).padStart(2,'0')).join('');}
Deno.serve(async(request:Request)=>{
 const origin=request.headers.get('origin');
 if(!origin||!ALLOWED_ORIGINS.has(origin))return new Response(null,{status:403,headers:{'Cache-Control':'no-store'}});
 const headers={...baseHeaders,'Access-Control-Allow-Origin':origin};
 const reply=(status:number,message:string)=>new Response(JSON.stringify({ok:status>=200&&status<300,message}),{status,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return reply(405,'method_not_allowed');
 const length=request.headers.get('content-length');
 if(length&&(!/^\d+$/.test(length)||Number(length)>12000))return reply(413,'request_too_large');
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return reply(415,'unsupported_media_type');
 try{
  const body=await request.text();
  if(body.length>12000)return reply(413,'request_too_large');
  const data=JSON.parse(body);
  if(!data||typeof data!=='object'||Array.isArray(data))return reply(400,'invalid_request');
  if(Object.keys(data).some(k=>!['name','email','subject','message','page','company','turnstileToken'].includes(k)))return reply(400,'invalid_request');
  if(data.company)return reply(200,'ok');
  const field=(key:string,max:number)=>typeof data[key]==='string'&&data[key].trim().length<=max?data[key].trim():'';
  const name=field('name',120),email=field('email',254).toLowerCase(),subject=field('subject',160),message=field('message',5000),page=field('page',300);
  if(name.length<2||email.length<5||!/^\S+@\S+\.\S+$/.test(email)||subject.length<2||message.length<10||!page.startsWith('/'))return reply(400,'invalid_request');
  const ip=request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'not-supplied';
  if(TURNSTILE_REQUIRED&&!TURNSTILE_SECRET_KEY)return reply(503,'service_unavailable');
  if(TURNSTILE_SECRET_KEY&&!(await verifyTurnstile(data.turnstileToken,new URL(origin).hostname)))
   return reply(403,'bot_verification_failed');
  if(!SERVICE_KEY||!PROJECT_URL)return reply(503,'service_unavailable');
  const payload={p_name:name,p_email:email,p_subject:subject,p_message:message,p_page:page,p_email_hash:await hash(email),p_ip_hash:await hash(ip)};
  const response=await fetch(PROJECT_URL+'/rest/v1/rpc/submit_p2lrn_contact',{method:'POST',headers:{apikey:SERVICE_KEY,Authorization:'Bearer '+SERVICE_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(response.ok)return reply(200,'ok');
  const err=await response.text();
  if(err.includes('p2lrn_contact_rate_limited'))return reply(429,'rate_limited');
  if(response.status===400||err.includes('invalid_contact_request'))return reply(400,'invalid_request');
  console.error('contact submission failed',response.status);
  return reply(503,'service_unavailable');
 }catch{return reply(400,'invalid_request');}
});
