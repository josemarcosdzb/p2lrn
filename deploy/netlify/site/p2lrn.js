(() => {
  const menu = document.querySelector('[data-menu]');
  const nav = document.getElementById('nav');

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? 'Cerrar' : 'Menú';
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        menu.setAttribute('aria-expanded', 'false');
        menu.textContent = 'Menú';
      });
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
      try {
        await navigator.clipboard.writeText(code);
        copied(button);
      } catch {}
    });
  });

  document.querySelectorAll('[data-copy-inline]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement?.querySelector('code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        copied(button);
      } catch {}
    });
  });

  Promise.all([
    fetch('/health.json', {cache:'no-store'}).then((response) => {
      if (!response.ok) throw new Error('health');
      return response.json();
    }),
    fetch('/index.json', {cache:'no-store'}).then((response) => {
      if (!response.ok) throw new Error('index');
      return response.json();
    }),
  ]).then(([health, index]) => {
    const version = health.playerVersion || index?.player?.version;
    if (version) {
      document.querySelectorAll('[data-player-version],[data-footer-version]').forEach((node) => {
        node.textContent = version;
      });
    }

    const healthNode = document.querySelector('[data-health]');
    if (healthNode) healthNode.textContent = health.ok ? 'CDN operativo' : 'CDN';
  }).catch(() => {
    const healthNode = document.querySelector('[data-health]');
    if (healthNode) healthNode.textContent = 'CDN';
  });

  const links = [...document.querySelectorAll('.nav a[href^="#"]')];
  const sections = links
    .map((link) => {
      const section = document.querySelector(link.getAttribute('href'));
      return section ? {link, section} : null;
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;

      links.forEach((link) => link.removeAttribute('aria-current'));
      const current = sections.find(({section}) => section === visible.target);
      current?.link.setAttribute('aria-current', 'page');
    }, {
      rootMargin:'-20% 0px -65% 0px',
      threshold:[0.05,0.2,0.5],
    });

    sections.forEach(({section}) => observer.observe(section));
  }
})();
