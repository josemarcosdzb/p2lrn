(() => {
  const SUPABASE_URL = 'https://yurtnmtesugykrqtujdx.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cmC0leUeJtwzXrZb7nUn1Q_xdYoAKfH';

  const menu = document.querySelector('[data-menu]');
  const nav = document.getElementById('nav');

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? 'Cerrar' : 'Menú';
    });
  }

  const copied = (button) => {
    const previous = button.textContent;
    button.textContent = 'Copiado';
    window.setTimeout(() => { button.textContent = previous; }, 1200);
  };

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.codebox')?.querySelector('code')?.innerText || '';
      try { await navigator.clipboard.writeText(code); copied(button); } catch {}
    });
  });

  document.querySelectorAll('[data-copy-inline]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement?.querySelector('code')?.innerText || '';
      try { await navigator.clipboard.writeText(code); copied(button); } catch {}
    });
  });

  document.querySelectorAll('[data-contact-form]').forEach((form) => {
    const status = form.querySelector('[data-form-status]');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (form.elements.company?.value) return;

      const now = Date.now();
      const last = Number(localStorage.getItem('p2lrn-contact-last') || 0);
      if (now - last < 30000) {
        if (status) status.textContent = 'Espera unos segundos antes de enviar otro mensaje.';
        return;
      }

      const button = form.querySelector('button[type="submit"]');
      const payload = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        subject: form.elements.subject.value.trim(),
        message: form.elements.message.value.trim(),
        page: window.location.pathname,
        source: 'website',
        status: 'new',
      };

      if (button) button.disabled = true;
      if (status) status.textContent = 'Enviando…';

      try {
        const response = await fetch(SUPABASE_URL + '/rest/v1/contact_messages', {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_PUBLISHABLE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error('contact_failed');

        localStorage.setItem('p2lrn-contact-last', String(now));
        form.reset();
        if (status) status.textContent = 'Mensaje enviado. Gracias por contactar.';
      } catch {
        if (status) status.textContent = 'No se pudo enviar el mensaje. Inténtalo de nuevo.';
      } finally {
        if (button) button.disabled = false;
      }
    });
  });

  Promise.all([
    fetch('/health.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
    fetch('/index.json', {cache:'no-store'}).then((r) => r.ok ? r.json() : Promise.reject()),
  ]).then(([health,index]) => {
    const version = health.playerVersion || index?.player?.version;
    if (version) document.querySelectorAll('[data-player-version],[data-footer-version]').forEach((n) => n.textContent = version);
    const node = document.querySelector('[data-health]');
    if (node) node.textContent = health.ok ? 'CDN operativo' : 'CDN';
  }).catch(() => {});
})();
