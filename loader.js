// BEGIN ANTIGRAVITY STATUSLINE LOADER
(() => {
    // ANTIGRAVITY_STATUSLINE_LOADER_V1
    if (window !== window.top) return;
    const proto = (window.location && window.location.protocol) || '';
    const isAgShell = !!(
        window.electronNative ||
        window.electronUpdater ||
        window.nativeStorage ||
        window.vscode ||
        window.__antigravity_force_shell === true ||
        proto === 'vscode-file:' ||
        proto === 'antigravity-ide:'
    );
    if (!isAgShell) return;
    if (window.__ag_statusline_loader_started) return;
    window.__ag_statusline_loader_started = true;

    const HEALTH_URL = 'http://127.0.0.1:39229/health';
    const WIDGET_URL = 'http://127.0.0.1:39229/widget.js';
    let loadedHash = null;
    let busy = false;

    async function loadOrReloadWidget() {
        if (busy) return;
        // Never interrupt the user while the settings popover is open
        if (window.__ag_statusline_popover_open && document.getElementById('agy-statusline-style')) {
            return;
        }
        busy = true;
        try {
            const hResp = await fetch(HEALTH_URL + '?cb=' + Date.now(), { cache: 'no-store' });
            if (!hResp.ok) return;
            const health = await hResp.json();
            const hash = (health && health.widgetHash) || '';
            if (loadedHash && hash && hash === loadedHash && document.getElementById('agy-statusline-style')) {
                return;
            }
            const resp = await fetch(WIDGET_URL + '?cb=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) return;
            const code = await resp.text();
            if (!code || code.length < 200) return;
            loadedHash = hash || String(code.length);
            (0, eval)(code);
        } catch (e) {
            // Server may still be starting up; will retry automatically
        } finally {
            busy = false;
        }
    }

    setTimeout(loadOrReloadWidget, 400);
    setInterval(loadOrReloadWidget, 15000);
})();
// END ANTIGRAVITY STATUSLINE LOADER
