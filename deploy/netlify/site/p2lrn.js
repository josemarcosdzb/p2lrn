(() => {
  const menu = document.querySelector('[data-menu]');
  const mobileNav = document.getElementById('mobile-nav');

  if (menu && mobileNav) {
    menu.addEventListener('click', () => {
      const open = mobileNav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
    });

    mobileNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileNav.classList.remove('is-open');
        menu.setAttribute('aria-expanded', 'false');
      });
    });
  }

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.terminal')?.querySelector('code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        const label = button.textContent;
        button.textContent = 'Copiado';
        window.setTimeout(() => { button.textContent = label; }, 1200);
      } catch {}
    });
  });

  document.querySelectorAll('[data-copy-inline]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement?.querySelector('code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        const label = button.textContent;
        button.textContent = 'Copiado';
        window.setTimeout(() => { button.textContent = label; }, 1200);
      } catch {}
    });
  });

  Promise.all([
    fetch('/health.json', {cache: 'no-store'}).then((response) => {
      if (!response.ok) throw new Error('health');
      return response.json();
    }),
    fetch('/index.json', {cache: 'no-store'}).then((response) => {
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

  const navLinks = [...document.querySelectorAll('.topnav a')];
  const sectionMap = navLinks
    .map((link) => {
      const id = link.getAttribute('href');
      if (!id?.startsWith('#')) return null;
      const section = document.querySelector(id);
      return section ? {link, section} : null;
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sectionMap.length) {
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      navLinks.forEach((link) => link.removeAttribute('aria-current'));
      const current = sectionMap.find(({section}) => section === visible.target);
      current?.link.setAttribute('aria-current', 'page');
    }, {rootMargin: '-20% 0px -65% 0px', threshold: [0.05, 0.2, 0.5]});

    sectionMap.forEach(({section}) => observer.observe(section));
  }
})();
