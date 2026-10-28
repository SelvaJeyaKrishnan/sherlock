(() => {
  let failed = false;
  const showFailure = () => {
    if (failed) return;
    failed = true;
    const panel = document.createElement('section');
    panel.className = 'client-load-error';
    panel.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = 'The game client could not start. Reload the page to try again.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => location.reload());
    panel.append(message, reload);
    document.body.append(panel);
  };
  window.addEventListener('sherlock-client-ready', () => {
    failed = false;
    document.querySelector('.client-load-error')?.remove();
  });
  window.addEventListener('error', (event) => {
    if (event.target instanceof HTMLScriptElement || event.error) {
      const failingScript = event.target instanceof HTMLScriptElement ? event.target.src : '';
      const details = event.error?.stack || event.error?.message || event.message || 'Unknown script error';
      console.error(`Sherlock client startup error in ${failingScript}: ${details}`);
      showFailure();
    }
  }, true);
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Sherlock client startup promise failed.', event.reason);
    showFailure();
  });
  window.setTimeout(() => {
    if (!window.__sherlockClientReady) showFailure();
  }, 20_000);
})();
