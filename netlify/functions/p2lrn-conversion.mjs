// First-party, anonymous action counters for the public P2LRN website.
// This function only logs allowlisted event categories. It does not store
// cookies, IP addresses, referrer URLs, user IDs, course content, or answers.
const EVENTS=new Set([
  'landing_view','link_studio','link_player','link_skills',
  'skill_download_clicked','studio_editor_ready',
  'player_course_rendered','studio_package_exported'
]);
const PAGES=new Set([
  '/','/en/','/studio/','/en/studio/','/demo/','/en/demo/',
  '/skills/','/en/skills/','/crear-cursos-interactivos/',
  '/en/create-interactive-courses/','/juegos-educativos-3d/',
  '/en/3d-educational-games/','/cursos-offline/','/en/offline-courses/'
]);
const DESTINATIONS=new Set(['','studio','player','skills','chatgpt','claude','gemini','grok']);

export default async function handler(request){
  if(request.method!=='POST')
    return new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
  const origin=request.headers.get('origin');
  const requested=new URL(request.url);
  if(origin && origin!==requested.origin && origin!=='https://p2lrn.org')
    return new Response(null,{status:403,headers:{'Cache-Control':'no-store'}});
  const length=Number(request.headers.get('content-length')||0);
  if(length>512)return new Response(null,{status:413});
  let event;
  try{
    const raw=await request.text();
    if(raw.length>512)return new Response(null,{status:413});
    event=JSON.parse(raw);
  }catch{return new Response(null,{status:400});}
  if(!event||typeof event!=='object'||!EVENTS.has(event.event)||
     !PAGES.has(event.page)||!DESTINATIONS.has(event.destination||'')||
     !['es','en'].includes(event.locale)||!['direct','internal','google','external'].includes(event.channel))
    return new Response(null,{status:400,headers:{'Cache-Control':'no-store'}});
  // Never log request headers or request bodies; only these fixed categories.
  console.info('P2LRN_CONVERSION '+JSON.stringify({
    at:new Date().toISOString(),
    event:event.event,page:event.page,locale:event.locale,
    destination:event.destination||'',channel:event.channel
  }));
  return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
}
