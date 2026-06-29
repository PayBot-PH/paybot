import { chromium } from 'playwright';

function collectIssues(node, issues = []) {
  if (!node) return issues;
  // common issues: controls without accessible name, generic role without name
  const role = node.role || '';
  const name = node.name || '';
  if ((/button|link|textbox|checkbox|radio|menuitem/.test(role) && !name) || (role === 'generic' && !name)) {
    issues.push({ role, name, node });
  }
  if (node.children) {
    for (const c of node.children) collectIssues(c, issues);
  }
  return issues;
}

(async () => {
  const urlBase = process.env.URL || 'http://localhost:5173';
  const pages = ['/merchants', '/users'];
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const results = {};

  for (const p of pages) {
    const page = await context.newPage();
    const url = new URL(p, urlBase).toString();
    console.log(`Visiting ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      // wait a bit for client rendering
      await page.waitForTimeout(800);
      // DOM-based heuristics: find interactive elements missing an accessible name
      const issues = await page.evaluate(() => {
        function isVisible(el) {
          if (!el) return false;
          const style = window.getComputedStyle(el);
          if (style.visibility === 'hidden' || style.display === 'none') return false;
          if (el.hasAttribute('hidden')) return false;
          return true;
        }
        function getName(el) {
          if (!el) return '';
          if (el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') return '[HIDDEN]';
          if (el.hasAttribute('aria-label')) return el.getAttribute('aria-label').trim();
          const labelledby = el.getAttribute('aria-labelledby');
          if (labelledby) {
            let text = '';
            labelledby.split(/\s+/).forEach(id => { const t = document.getElementById(id); if (t) text += t.innerText + ' '; });
            if (text.trim()) return text.trim();
          }
          if (el.alt) return el.alt;
          if (el.title) return el.title;
          if (el.innerText && el.innerText.trim()) return el.innerText.trim();
          return '';
        }

        const selector = 'button, a[href], input, textarea, select, [role]';
        const found = Array.from(document.querySelectorAll(selector));
        const results = [];
        for (const el of found) {
          if (!isVisible(el)) continue;
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const name = getName(el);
          const isInteractive = ['button','a','input','textarea','select'].includes(el.tagName.toLowerCase()) || el.hasAttribute('role');
          if (isInteractive && name === '') {
            // produce a simple CSS path to help locate
            function cssPath(e) {
              if (!e || !e.tagName) return '';
              let path = e.tagName.toLowerCase();
              if (e.id) path += `#${e.id}`;
              if (e.className && typeof e.className === 'string') path += '.' + e.className.trim().split(/\s+/).join('.');
              return path;
            }
            results.push({ selector: cssPath(el), tag: el.tagName.toLowerCase(), role, name });
          }
        }
        // additional checks: form controls with no associated label
        function hasLabel(control) {
          if (!control) return false;
          if (control.getAttribute('aria-label')) return true;
          if (control.getAttribute('aria-labelledby')) return true;
          if (control.id) {
            const lab = document.querySelector(`label[for="${control.id}"]`);
            if (lab) return true;
          }
          // check if wrapped in a label
          let p = control.parentElement;
          while (p) {
            if (p.tagName.toLowerCase() === 'label') return true;
            p = p.parentElement;
          }
          return false;
        }

        const labelIssues = [];
        const controls = Array.from(document.querySelectorAll('input,textarea,select'));
        for (const c of controls) {
          if (!isVisible(c)) continue;
          const type = c.getAttribute('type') || c.tagName.toLowerCase();
          // skip hidden inputs
          if (type === 'hidden') continue;
          if (!hasLabel(c)) {
            labelIssues.push({ selector: c.tagName.toLowerCase() + (c.id ? `#${c.id}` : ''), reason: 'missing-label-or-aria' });
          }
        }

        // check table headers for aria-sort when they appear clickable
        const thIssues = [];
        const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]'));
        for (const h of headers) {
          if (!isVisible(h)) continue;
          const hasClick = h.querySelector('button') || h.getAttribute('role') === 'button' || h.getAttribute('tabindex') !== null;
          const ariaSort = h.getAttribute('aria-sort');
          if (hasClick && !ariaSort) {
            thIssues.push({ selector: h.tagName.toLowerCase() + (h.id ? `#${h.id}` : ''), reason: 'missing-aria-sort' });
          }
        }

        return { nameIssues: results, labelIssues, thIssues };
      });
      results[p] = issues;
      console.log(`Page ${p} DOM checks complete. nameIssues: ${issues.nameIssues.length}, labelIssues: ${issues.labelIssues.length}, thIssues: ${issues.thIssues.length}`);
      if (issues.nameIssues.length > 0) console.table(issues.nameIssues.slice(0, 50));
      if (issues.labelIssues.length > 0) console.table(issues.labelIssues.slice(0, 50));
      if (issues.thIssues.length > 0) console.table(issues.thIssues.slice(0, 50));
    } catch (e) {
      console.error(`Error visiting ${url}:`, e.message || e);
      results[p] = { error: String(e) };
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('Accessibility check summary:', JSON.stringify(results, null, 2));
  // exit with non-zero if any issues
  const totalIssues = Object.values(results).reduce((acc, r) => acc + ((r.issues && r.issues.length) || 0), 0);
  process.exit(totalIssues > 0 ? 2 : 0);
})();
