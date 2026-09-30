(() => {
  const menu = document.querySelector('[data-menu]');
  const nav = document.getElementById('nav');
  const progress = document.querySelector('[data-progress]');

  if (menu && nav) {
    menu.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      menu.setAttribute('aria-expanded', String(open));
      menu.textContent = open ? 'CLOSE' : 'INDEX';
    });

    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        menu.setAttribute('aria-expanded', 'false');
        menu.textContent = 'INDEX';
      });
    });
  }

  const setCopied = (button) => {
    const previous = button.textContent;
    button.textContent = 'COPIED';
    window.setTimeout(() => { button.textContent = previous; }, 1100);
  };

  document.querySelectorAll('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.closest('.codebox')?.querySelector('code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        setCopied(button);
      } catch {}
    });
  });

  document.querySelectorAll('[data-copy-inline]').forEach((button) => {
    button.addEventListener('click', async () => {
      const code = button.parentElement?.querySelector('code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        setCopied(button);
      } catch {}
    });
  });

  const updateProgress = () => {
    if (!progress) return;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
    progress.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
  };

  updateProgress();
  window.addEventListener('scroll', updateProgress, {passive:true});
  window.addEventListener('resize', updateProgress);

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
    if (healthNode) healthNode.textContent = health.ok ? 'CDN ONLINE' : 'CDN';
  }).catch(() => {
    const healthNode = document.querySelector('[data-health]');
    if (healthNode) healthNode.textContent = 'CDN';
  });
})();
