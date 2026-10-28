for (const modulePath of ['/vendor/three.module.js', './world-layout.js', './world3d.js', './app.js']) {
  try { await import(modulePath); }
  catch (error) {
    let responseInfo = '';
    try {
      const response = await fetch(modulePath, { cache: 'no-store' });
      responseInfo = ` HTTP ${response.status}, ${response.headers.get('content-type') || 'no content type'}, ${response.headers.get('content-length') || 'length unknown'}`;
      await response.body?.cancel();
    } catch (fetchError) { responseInfo = ` fetch retry failed: ${fetchError?.message || fetchError}`; }
    window.__sherlockClientError = `${error?.stack || error?.message || String(error)}${responseInfo}`;
    console.error(`Sherlock game client failed while importing ${modulePath}.`, window.__sherlockClientError);
    break;
  }
}
