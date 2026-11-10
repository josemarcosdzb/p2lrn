// Public website contact forms only. Loaded explicitly by /contacto/ and /en/contact/.
// No P2LRN Player, Studio, Toolkit, LTI or LMS runtime dependency.
(()=>{
  'use strict';
  const forms=document.querySelectorAll('[data-contact-form]');
  if(!forms.length)return;
  const SUPABASE_URL="https://yurtnmtesugykrqtujdx.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY="sb_publishable_cmC0leUeJtwzXrZb7nUn1Q_xdYoAKfH";
  const messages=(document.documentElement.lang||'').toLowerCase().startsWith('en')
    ?{
    wait: "Wait a few seconds before sending another message.",
    loadError: "Unable to load security verification.",
    configError: "Security verification is temporarily unavailable. Please try later.",
    verify: "Complete the security verification before sending.",
    sending: "Sending…",
    sent: "Message sent. Thank you for contacting us.",
    limited: "Submission limit reached. Please try again later.",
    failed: "Could not send the message. Please try again.",
  } :{
    wait: "Espera unos segundos antes de enviar otro mensaje.",
    loadError: "No se pudo cargar la verificación de seguridad.",
    configError: "No está disponible la verificación de seguridad. Inténtalo más tarde.",
    verify: "Completa la verificación antes de enviar.",
    sending: "Enviando…",
    sent: "Mensaje enviado. Gracias por contactar.",
    limited: "Límite de envíos alcanzado. Inténtalo más tarde.",
    failed: "No se pudo enviar el mensaje. Inténtalo de nuevo.",
  };

  document.querySelectorAll('[data-contact-form]').forEach((form) => {
      const status = form.querySelector('[data-form-status]');
      let sitekey=(form.dataset.turnstileSitekey||'').trim();
      let required=Boolean(sitekey);
      let unavailable=false;
      let turnstileToken='';
      let turnstileWidgetId=null;
      let mounted=false;
      const mountChallenge=()=>{
        if(!sitekey||mounted)return;
        mounted=true;
        const mount=document.createElement('div');
        mount.className='p2lrn-contact-turnstile';
        form.querySelector('button[type="submit"]')?.before(mount);
        const script=document.createElement('script');
        script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async=true;
        script.onload=()=>{
          turnstileWidgetId=window.turnstile?.render(mount,{
            sitekey,action:'contact',
            callback:token=>{turnstileToken=String(token||'')},
            'expired-callback':()=>{turnstileToken=''},
            'error-callback':()=>{turnstileToken=''},
          });
        };
        script.onerror=()=>{unavailable=true;if(status)status.textContent=messages.loadError;};
        document.head.append(script);
      };
      if(sitekey)mountChallenge();
      // The public configuration is returned by the actual server; never ship a
      // Turnstile secret in site assets. Missing/failed config stops submission.
      const setup=fetch(SUPABASE_URL+'/functions/v1/p2lrn-contact?config=1',{
        headers:{apikey:SUPABASE_PUBLISHABLE_KEY},cache:'no-store'
      }).then(async response=>{
        if(!response.ok)throw new Error('contact_config_unavailable');
        const config=await response.json();
        required=config.required===true;
        if(!sitekey&&typeof config.sitekey==='string')sitekey=config.sitekey.trim();
        if(required&&!sitekey)unavailable=true;
        mountChallenge();
      }).catch(()=>{unavailable=true;});
  
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (form.elements.company?.value) return;
  
        const now = Date.now();
        const last = Number(localStorage.getItem('p2lrn-contact-last') || 0);
        if (now - last < 30000) {
          if (status) status.textContent = messages.wait;
          return;
        }
  
        await setup;
        if(unavailable||(required&&!sitekey)){
          if(status)status.textContent=messages.configError;
          return;
        }
        if((required||sitekey)&&!turnstileToken){
          if(status)status.textContent=messages.verify;
          return;
        }
        const button = form.querySelector('button[type="submit"]');
        const payload = {
          name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
          subject: form.elements.subject.value.trim(),
          message: form.elements.message.value.trim(),
          page: window.location.pathname,
          ...(sitekey ? {turnstileToken} : {}),
        };
  
        if (button) button.disabled = true;
        if (status) status.textContent = messages.sending;
  
        try {
          const response = await fetch(SUPABASE_URL + '/functions/v1/p2lrn-contact', {
            method: 'POST',
            headers: {
              apikey: SUPABASE_PUBLISHABLE_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
          if (response.status === 429) throw new Error('contact_rate_limited');
          if (!response.ok) throw new Error('contact_failed');
          localStorage.setItem('p2lrn-contact-last', String(now));
          form.reset();
          if (status) status.textContent = messages.sent;
        } catch (error) {
          if (status) status.textContent = error?.message === 'contact_rate_limited' ? messages.limited : messages.failed;
        } finally {
          if(sitekey){
            turnstileToken='';
            if(turnstileWidgetId!==null)window.turnstile?.reset(turnstileWidgetId);
          }
          if (button) button.disabled = false;
        }
      });
    });

})();
