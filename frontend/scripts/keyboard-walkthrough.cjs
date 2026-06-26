const { chromium } = require('playwright');

(async () => {
  const urlBase = process.env.URL || 'http://localhost:3000';
  const pages = ['/', '/dashboard', '/merchants', '/users', '/wallet', '/transactions', '/xendit', '/payments', '/policies'];
  const browser = await chromium.launch();
  const context = await browser.newContext();

  // inject a test token before any scripts run so the app thinks it's authenticated
  await context.addInitScript(() => {
    try {
      localStorage.setItem('token', 'test-authtoken-123');
    } catch (e) {
      // ignore
    }
  });

  // stub API responses under /api/v1 to avoid network errors and allow the SPA to render
  await context.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    console.log('STUB_API:', url);

    if (url.endsWith('/api/v1/auth/me') || url.endsWith('/api/v1/auth/me/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 1, email: 'test@local', name: 'Test User', role: 'admin' }),
      });
    }

    if (url.endsWith('/api/v1/app-settings/maintenance')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ maintenance_mode: false }),
      });
    }

    if (url.includes('/api/v1/merchants')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { items: [], total: 0 } }),
      });
    }

    if (url.includes('/api/v1/users')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { items: [], total: 0 } }),
      });
    }

    if (url.includes('/api/v1/entities/transactions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { items: [], total: 0 } }),
      });
    }

    if (url.includes('/api/v1/wallet/transactions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    }

    if (url.endsWith('/api/v1/gateway/available-banks')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { name: 'BDO', code: 'BDO' },
          { name: 'BPI', code: 'BPI' },
          { name: 'GCASH', code: 'GCASH' },
          { name: 'MAYA', code: 'MAYA' },
        ]),
      });
    }

    if (url.endsWith('/api/v1/wallet/crypto-deposit-info')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ address: '0x0000000000000000000000000000000000000000' }),
      });
    }

    if (url.includes('/api/v1/wallet/wallet')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ balance: 0, currency: url.includes('USD') ? 'USD' : 'PHP' }),
      });
    }

    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });

  for (const p of pages) {
    const page = await context.newPage();
    page.on('console', m => console.log('PAGE_CONSOLE:', m.text()));
    page.on('pageerror', err => console.log('PAGE_ERROR:', err && err.message ? err.message : String(err), '\nSTACK:\n', err && err.stack ? err.stack : 'no-stack'));
    const url = new URL(p, urlBase).toString();
    console.log(`Visit ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      // wait for the main landmark or root to be hydrated
      try {
        await page.waitForSelector('main[role="main"]', { timeout: 20000 });
      } catch (e) {
        // fallback to waiting for #root to have content
      }

      // small pause to allow client rendering
      await page.waitForTimeout(600);

      const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length || 0);
      console.log('ROOT_HTML_LEN:', rootLen);

      // ensure body is focused first
      await page.evaluate(() => { (document.body || document.documentElement).focus(); });
      await page.waitForTimeout(200);

      // List focusable elements on the page and identify accessibility issues
      const focusableReport = await page.evaluate(() => {
        const selector = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
        const els = Array.from(document.querySelectorAll(selector));
        const missingName = [];
        const items = els.map((el, i) => {
          const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { x:0,y:0,width:0,height:0 };
          const computed = window.getComputedStyle(el);
          const visible = rect.width > 0 && rect.height > 0 && computed.visibility !== 'hidden' && computed.display !== 'none';
          const labelText = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || '';
          const labelFromControl = (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) && el.labels && el.labels.length
            ? Array.from(el.labels).map((label) => label.textContent?.trim() || '').join(' ').trim()
            : '';
          const name = (labelText || labelFromControl || el.textContent?.trim() || '').slice(0,120);
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          if (!name.trim()) {
            missingName.push({ index: i+1, tag: el.tagName, role, id: el.id || null, classes: el.className || null, visible });
          }
          return {
            index: i+1,
            tag: el.tagName,
            role,
            id: el.id || null,
            name: name || null,
            classes: el.className || null,
            href: el.href || null,
            disabled: el.disabled || false,
            visible,
            rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
          };
        });
        return { items, missingName };
      });

      console.log(`Focusable elements for ${p}: ${focusableReport.items.length}`);
      for (let i = 0; i < Math.min(focusableReport.items.length, 40); i++) {
        const e = focusableReport.items[i];
        console.log(`${e.index}. <${e.tag.toLowerCase()}> visible=${e.visible} disabled=${e.disabled} id=${e.id || '-'} name=${e.name || '-'} classes=${(e.classes||'').slice(0,80)}`);
      }
      if (focusableReport.missingName.length) {
        console.log(`Missing accessible name for ${focusableReport.missingName.length} focusable element(s) on ${p}`);
        for (let i = 0; i < Math.min(focusableReport.missingName.length, 10); i++) {
          const issue = focusableReport.missingName[i];
          console.log(`  ${issue.index}. <${issue.tag.toLowerCase()}> role=${issue.role} id=${issue.id || '-'} visible=${issue.visible} classes=${(issue.classes||'').slice(0,80)}`);
        }
      }

      if (focusableReport.items.length === 0) {
        console.log('No focusable interactive elements detected on this route.');
      } else {
        // Attempt a short tab-run to confirm focus moves among visible elements and that focus has a visible indicator
        const seq = [];
        const noFocusRing = [];
        for (let i = 0; i < Math.min(80, focusableReport.items.length * 3); i++) {
          await page.keyboard.press('Tab');
          await page.waitForTimeout(50);
          const active = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el) return null;
            const style = window.getComputedStyle(el);
            const outlineVisible = style.outlineStyle !== 'none' && style.outlineWidth !== '0px' && style.outlineColor !== 'transparent';
            const boxShadowVisible = style.boxShadow && style.boxShadow !== 'none';
            const borderVisible = style.borderStyle !== 'none' && style.borderWidth !== '0px';
            const hasFocusIndicator = outlineVisible || boxShadowVisible || borderVisible;
            return {
              tag: el.tagName,
              id: el.id || null,
              name: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || el.textContent?.trim()?.slice(0,80) || null,
              role: el.getAttribute('role') || null,
              hasFocusIndicator,
              outline: style.outline,
              boxShadow: style.boxShadow,
              border: `${style.borderWidth} ${style.borderStyle}`,
            };
          });
          if (!active) break;
          seq.push(active);
          if (!active.hasFocusIndicator) {
            noFocusRing.push({ index: i+1, ...active });
          }
        }
        console.log(`Tab sequence length for ${p}: ${seq.length}`);
        for (let i = 0; i < Math.min(seq.length, 40); i++) console.log(`${i+1}. <${seq[i].tag.toLowerCase()}> id=${seq[i].id || '-'} name=${seq[i].name || '-'} `);
        if (noFocusRing.length) {
          console.log(`Focus ring missing for ${noFocusRing.length} active element(s) on ${p}`);
          for (let i = 0; i < Math.min(noFocusRing.length, 10); i++) {
            const issue = noFocusRing[i];
            console.log(`  ${issue.index}. <${issue.tag.toLowerCase()}> id=${issue.id || '-'} name=${issue.name || '-'} role=${issue.role || '-'} outline=${issue.outline} boxShadow=${issue.boxShadow} border=${issue.border}`);
          }
        }
      }

    } catch (err) {
      console.error('Error on', url, err.message || err);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  process.exit(0);
})();
