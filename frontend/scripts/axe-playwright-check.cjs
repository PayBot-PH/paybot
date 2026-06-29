const { chromium } = require('playwright');
const axe = require('axe-core');

(async () => {
  const urlBase = process.env.URL || 'http://localhost:3000';
  const pages = ['/', '/dashboard', '/merchants', '/users', '/wallet', '/transactions', '/xendit', '/payments', '/policies'];
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const results = {};

  for (const p of pages) {
    const page = await context.newPage();
    const url = new URL(p, urlBase).toString();
    console.log(`Visiting ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(800);
      // inject axe-core into the page
      await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
      const res = await page.evaluate(async () => {
        return await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'best-practice'] } });
      });
      results[p] = res;
      console.log(`Violations for ${p}: ${res.violations.length}`);
      if (res.violations.length) {
        for (const v of res.violations) {
          console.log(`- ${v.id}: ${v.help} (${v.impact})`);
          for (const node of v.nodes) {
            console.log(`  -> ${node.html}`);
          }
        }
      }
    } catch (e) {
      console.error(`Error visiting ${url}:`, e.message || e);
      results[p] = { error: String(e) };
    } finally {
      await page.close();
    }
  }

  await browser.close();
  const totalViolations = Object.values(results).reduce((acc, r) => acc + ((r.violations && r.violations.length) || 0), 0);
  console.log('Axe summary:', Object.keys(results).map(k => ({ page: k, violations: results[k].violations ? results[k].violations.length : 0 }))); 
  process.exit(totalViolations > 0 ? 2 : 0);
})();
