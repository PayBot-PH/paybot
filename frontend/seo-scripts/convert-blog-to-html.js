import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { marked } from "./marked.esm.js";

// Get project root directory (parent directory of seo-scripts)
const currentFile = fileURLToPath(import.meta.url);
const __dirname = path.dirname(currentFile);
const projectRoot = path.resolve(__dirname, '..');

// Base URL of the website (should match the actual domain)
const baseUrl = "https://atoms.template.com";

// GA4 Measurement ID - set via site.config.json
// Format: "G-XXXXXXXXXX" or empty string if not needed
let GA4_MEASUREMENT_ID = "";

// Source markdown files directory
// First look for ./seo/content in the project, if not found, look for ../seo/content at the same level
const localBlogDir = path.resolve(projectRoot, 'seo', 'content');
const siblingBlogDir = path.resolve(projectRoot, '..', 'seo', 'content');
const blogDir = fs.existsSync(localBlogDir) ? localBlogDir : siblingBlogDir;
const distBlogDir = path.resolve(projectRoot, 'dist', 'blog');

function getHtmlTemplate(title, content, datePublished, dateModified, meta = {}) {
  const tags = meta.tags || [];
  const keywords = meta.keywords || tags.join(', ');
  const description = meta.description || title;
  const isoDatePublished = datePublished ? new Date(datePublished).toISOString() : '';
  const isoDateModified = dateModified ? new Date(dateModified).toISOString() : '';
  const displayDate = datePublished || dateModified;
  const isoDate = displayDate ? new Date(displayDate).toISOString() : '';
  const toc = meta.toc || '';
  const slug = meta.slug || '';
  const lang = meta.lang || 'en';

  const ogLocaleMap = {
    'zh': 'zh_CN',
    'zh-CN': 'zh_CN',
    'zh-TW': 'zh_TW',
    'en': 'en_US',
    'ja': 'ja_JP',
    'ko': 'ko_KR',
    'fr': 'fr_FR',
    'de': 'de_DE',
    'es': 'es_ES',
    'pt': 'pt_BR',
    'ru': 'ru_RU'
  };
  const ogLocale = ogLocaleMap[lang] || ogLocaleMap[lang.split('-')[0]] || 'en_US';

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": title,
    "description": description,
    "datePublished": isoDatePublished,
    "dateModified": isoDateModified || isoDatePublished,
    "author": {
      "@type": "Person",
      "name": meta.author || "Sarah"
    },
    "keywords": keywords,
    "inLanguage": lang
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": baseUrl
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Blog",
        "item": `${baseUrl}/blog/`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": title,
        "item": `${baseUrl}/blog/${slug}/`
      }
    ]
  };

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${description}">
  ${keywords ? `<meta name="keywords" content="${keywords}">` : ''}
  
  <link rel="canonical" href="${baseUrl}/blog/${slug}/">
  
  <meta property="og:type" content="article">
  <meta property="og:url" content="${baseUrl}/blog/${slug}/">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:locale" content="${ogLocale}">
  ${isoDatePublished ? `<meta property="article:published_time" content="${isoDatePublished}">` : ''}
  ${isoDateModified ? `<meta property="article:modified_time" content="${isoDateModified}">` : ''}
  ${tags.map(tag => `<meta property="article:tag" content="${tag}">`).join('\n  ')}
  
  <meta name="twitter:card" content="summary">
  <meta name="twitter:url" content="${baseUrl}/blog/${slug}/">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  
  <title>${title}</title>
  
  <script type="application/ld+json">
${JSON.stringify(blogPostingSchema, null, 2)}
  </script>
  
  <script type="application/ld+json">
${JSON.stringify(breadcrumbSchema, null, 2)}
  </script>
  ${GA4_MEASUREMENT_ID ? `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA4_MEASUREMENT_ID}');
  </script>` : ''}
  <style>
    :root {
      --font-serif: "Georgia", "Cambria", "Times New Roman", serif;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: "SF Mono", "Monaco", "Inconsolata", "Fira Code", "Courier New", monospace;
      --color-text: #1a1a1a;
      --color-text-light: #6b6b6b;
      --color-text-lighter: #9b9b9b;
      --color-border: #e5e5e5;
      --color-bg: #ffffff;
      --color-bg-secondary: #fafafa;
      --color-accent: #2962ff;
      --max-width: 680px;
      --max-width-wide: 900px;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--font-sans);
      font-size: 18px;
      line-height: 1.7;
      color: var(--color-text);
      background-color: var(--color-bg);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    .container {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 4rem 2rem;
    }
    
    @media (min-width: 1200px) {
      .container {
        max-width: var(--max-width-wide);
      }
    }
    
    @media (min-width: 1600px) {
      .container {
        max-width: 1200px;
      }
    }
    
    /* Navigation */
    .nav {
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .nav-btn {
      font-size: 0.9rem;
      color: var(--color-text-light);
      text-decoration: none;
      transition: color 0.2s;
      font-weight: 500;
    }
    
    .nav-btn:hover {
      color: var(--color-text);
    }
    
    /* Breadcrumb */
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.85rem;
      color: var(--color-text-lighter);
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid var(--color-border);
    }
    
    .breadcrumb a {
      color: var(--color-text-light);
      text-decoration: none;
      transition: color 0.2s;
    }
    
    .breadcrumb a:hover {
      color: var(--color-text);
    }
    
    .breadcrumb-separator {
      color: var(--color-text-lighter);
    }
    
    .breadcrumb-current {
      color: var(--color-text);
    }
    
    h1 {
      font-family: var(--font-serif);
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--color-text);
      margin-bottom: 1.5rem;
      line-height: 1.15;
    }
    
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      color: var(--color-text-lighter);
      font-size: 0.9rem;
      margin-bottom: 3rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--color-border);
    }
    
    .meta-item {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .content h2 {
      font-family: var(--font-serif);
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-text);
      margin-top: 3rem;
      margin-bottom: 1rem;
      letter-spacing: -0.02em;
      line-height: 1.3;
    }
    
    .content h3 {
      font-family: var(--font-serif);
      font-size: 1.35rem;
      font-weight: 600;
      color: var(--color-text);
      margin-top: 2rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.01em;
    }
    
    .content h4 {
      font-size: 1.1rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.5rem;
    }
    
    .content p {
      margin-bottom: 1.5rem;
      line-height: 1.8;
      color: var(--color-text);
    }
    
    .content ul, .content ol {
      margin-bottom: 1.5rem;
      padding-left: 2rem;
      color: var(--color-text);
    }
    
    .content li {
      margin-bottom: 0.5rem;
      line-height: 1.7;
    }
    
    .content a {
      color: var(--color-accent);
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
      transition: opacity 0.2s;
    }
    
    .content a:hover {
      opacity: 0.7;
    }
    
    .content img {
      max-width: 100%;
      height: auto;
      margin: 2.5rem 0;
      display: block;
    }
    
    .content blockquote {
      border-left: 3px solid var(--color-text);
      padding-left: 1.5rem;
      margin: 2rem 0;
      color: var(--color-text-light);
      font-style: italic;
      font-size: 1.05rem;
    }
    
    .content code {
      font-family: var(--font-mono);
      font-size: 0.9em;
      background-color: var(--color-bg-secondary);
      color: var(--color-text);
      padding: 0.2em 0.4em;
      border-radius: 3px;
    }
    
    .content pre {
      background-color: #282c34;
      color: #abb2bf;
      padding: 1.5rem;
      border-radius: 6px;
      overflow-x: auto;
      margin: 2rem 0;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      line-height: 1.6;
    }
    
    .content pre code {
      background: transparent;
      padding: 0;
      color: inherit;
      font-size: inherit;
    }
    
    .content table {
      width: 100%;
      border-collapse: collapse;
      margin: 2rem 0;
      font-size: 0.95rem;
    }
    
    .content th, .content td {
      border: 1px solid var(--color-border);
      padding: 0.75rem;
      text-align: left;
    }
    
    .content th {
      background-color: var(--color-bg-secondary);
      font-weight: 600;
    }
    
    .content hr {
      border: none;
      border-top: 1px solid var(--color-border);
      margin: 3rem 0;
    }

    .toc {
      background: var(--color-bg-secondary);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      padding: 1.5rem;
      margin-bottom: 3rem;
    }
    
    .toc-title {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-light);
      margin-bottom: 1rem;
    }
    
    .toc-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .toc-item {
      margin-bottom: 0.35rem;
    }
    
    .toc-item-h2 {
      font-weight: 500;
    }
    
    .toc-item-h3 {
      padding-left: 1rem;
      font-size: 0.9rem;
    }
    
    .toc-item a {
      color: var(--color-text);
      text-decoration: none;
      transition: color 0.2s;
      display: block;
      padding: 0.25rem 0;
      font-size: 0.95rem;
    }
    
    .toc-item a:hover {
      color: var(--color-accent);
    }

    @media (max-width: 768px) {
      body {
        font-size: 16px;
      }
      
      .container {
        padding: 2rem 1.5rem;
      }
      
      h1 {
        font-size: 2rem;
      }
      
      .content h2 {
        font-size: 1.5rem;
      }
      
      .content h3 {
        font-size: 1.2rem;
      }
    }
  </style>
</head>
<body>
  <main class="container">
    <nav class="nav">
      <a href="/blog/" class="nav-btn">← All Articles</a>
      <a href="/" class="nav-btn">Home</a>
    </nav>
    
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a>
      <span class="breadcrumb-separator">/</span>
      <a href="/blog/">Blog</a>
      <span class="breadcrumb-separator">/</span>
      <span class="breadcrumb-current">${escapeHtml(title)}</span>
    </nav>
    
    <article>
      <header>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          ${displayDate ? `<div class="meta-item"><time datetime="${isoDate}">${formatDate(displayDate)}</time></div>` : ''}
          ${tags.length > 0 ? `<div class="meta-item">${tags.join(' · ')}</div>` : ''}
        </div>
      </header>
      
      ${toc}
      
      <div class="content">
        ${content}
      </div>
    </article>
  </main>
</body>
</html>`;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (e) {
    return dateString;
  }
}

// Parse frontmatter
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, markdown: content };
  }

  const frontmatterText = match[1];
  const markdown = match[2];
  const frontmatter = {};

  let currentKey = null;
  let inArray = false;

  // Parse YAML frontmatter
  frontmatterText.split('\n').forEach(line => {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) return;

    // Check if it's an array item (starts with -)
    if (trimmedLine.startsWith('-')) {
      const value = trimmedLine.substring(1).trim();
      // Handle quoted values
      const cleanValue = (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
        ? value.slice(1, -1) : value;

      if (currentKey && inArray) {
        frontmatter[currentKey].push(cleanValue);
      } else if (currentKey) {
        frontmatter[currentKey] = [cleanValue];
        inArray = true;
      }
      return;
    }

    // Reset array state
    inArray = false;

    // Check if it's a key-value pair
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex > 0) {
      currentKey = trimmedLine.substring(0, colonIndex).trim();
      let value = trimmedLine.substring(colonIndex + 1).trim();

      // Handle quoted strings
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // If value is empty, it might be the start of an array
      if (!value) {
        frontmatter[currentKey] = [];
        inArray = true;
      } else {
        frontmatter[currentKey] = value;
      }
    }
  });

  return { frontmatter, markdown };
}

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '') // Remove non-alphanumeric and non-Chinese characters (keep -)
    .replace(/--+/g, '-')           // Replace multiple - with single -
    .replace(/^-+/, '')             // Remove leading -
    .replace(/-+$/, '');            // Remove trailing -
}

// Generate table of contents
function generateTOC(htmlContent) {
  const headings = [];
  const regex = /<h([23])[^>]*>(.*?)<\/h\1>/gi;
  let match;
  const slugCounts = {};

  while ((match = regex.exec(htmlContent)) !== null) {
    const level = parseInt(match[1]);
    const text = match[2].replace(/<[^>]*>/g, ''); // Remove HTML tags
    let slug = slugify(text);

    // If slug is empty (might be a symbol-only title), use heading-number as fallback
    if (!slug) {
      slug = `heading-${headings.length}`;
    }

    // Handle duplicate slugs
    if (slugCounts[slug] !== undefined) {
      slugCounts[slug]++;
      slug = `${slug}-${slugCounts[slug]}`;
    } else {
      slugCounts[slug] = 0;
    }

    headings.push({ level, text, id: slug });
  }

  if (headings.length === 0) return { toc: '', content: htmlContent };

  // Add IDs to headings
  let contentWithIds = htmlContent;
  let headingIndex = 0;
  contentWithIds = contentWithIds.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attrs, text) => {
    // Check if id attribute already exists
    if (attrs.includes('id=')) {
      return match;
    }

    // Get corresponding heading information
    if (headingIndex < headings.length) {
      const heading = headings[headingIndex];
      headingIndex++;
      return `<h${level} id="${heading.id}">${text}</h${level}>`;
    }

    return match;
  });

  // Generate TOC HTML
  let tocHtml = '<nav class="toc"><div class="toc-title">Contents</div><ul class="toc-list">';
  headings.forEach(heading => {
    const indent = heading.level === 3 ? 'toc-item-h3' : 'toc-item-h2';
    tocHtml += `<li class="toc-item ${indent}"><a href="#${heading.id}">${heading.text}</a></li>`;
  });
  tocHtml += '</ul></nav>';

  return { toc: tocHtml, content: contentWithIds };
}

// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Process a single markdown file
function processMarkdownFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const { frontmatter, markdown } = parseFrontmatter(content);

  // Get file system dates
  // This is more reliable than markdown frontmatter date which may be inaccurate from AI generation
  const fileStat = fs.statSync(filePath);
  // datePublished: prefer birthtime (creation time) if available, otherwise use mtime
  const datePublished = fileStat.birthtime && fileStat.birthtime.getTime() > 0
    ? fileStat.birthtime.toISOString()
    : fileStat.mtime.toISOString();
  // dateModified: always use mtime (modification time) - this is what lastmod should use
  const dateModified = fileStat.mtime.toISOString();

  // Get filename (without extension) as slug
  const fileName = path.basename(filePath, '.md');

  // Convert markdown to HTML
  let htmlContent;
  let toc = '';
  try {
    htmlContent = marked.parse(markdown);

    // Remove H1 tag that might exist at the beginning of content to avoid duplication with page title
    if (htmlContent.trim().startsWith('<h1')) {
      htmlContent = htmlContent.replace(/^\s*<h1[^>]*>.*?<\/h1>\s*/i, '');
    }

    // Generate table of contents and add heading IDs
    const tocResult = generateTOC(htmlContent);
    htmlContent = tocResult.content;
    toc = tocResult.toc;
  } catch (error) {
    htmlContent = `<pre>${escapeHtml(markdown)}</pre>`;
  }

  const title = frontmatter.title || fileName.replace(/_/g, ' ');

  // Generate HTML - use file system dates instead of frontmatter.date
  const html = getHtmlTemplate(
    title,
    htmlContent,
    datePublished,
    dateModified,
    {
      description: frontmatter.description || title,
      keywords: frontmatter.keywords || '',
      tags: frontmatter.tags || [],
      toc: toc,
      slug: fileName,
      author: frontmatter.author,
      lang: frontmatter.lang || 'en'
    }
  );

  // Create a separate directory for each article
  const articleDir = path.join(distBlogDir, fileName);
  if (!fs.existsSync(articleDir)) {
    fs.mkdirSync(articleDir, { recursive: true });
  }

  // Write to dist/blog/filename/index.html
  const outputPath = path.join(articleDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  return {
    slug: fileName,
    title,
    date: datePublished,
    dateModified: dateModified,
    tags: frontmatter.tags || [],
    path: `/blog/${fileName}/`,
    lang: frontmatter.lang || 'en'
  };
}

// Generate list page
function generateListPage(articles) {
  // Sort by date (newest first)
  const sortedArticles = [...articles].sort((a, b) => {
    const dateA = a.date ? new Date(a.date) : new Date(0);
    const dateB = b.date ? new Date(b.date) : new Date(0);
    return dateB - dateA;
  });

  // Use the first article's language as the list page language
  const pageLang = sortedArticles.length > 0 ? (sortedArticles[0].lang || 'en') : 'en';

  const listHtml = `<!DOCTYPE html>
<html lang="${pageLang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Blog Articles List">
  
  <link rel="canonical" href="${baseUrl}/blog/">
  
  <title>Articles</title>
  ${GA4_MEASUREMENT_ID ? `
  <!-- Google tag (gtag.js) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${GA4_MEASUREMENT_ID}');
  </script>` : ''}
  <style>
    :root {
      --font-serif: "Georgia", "Cambria", "Times New Roman", serif;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --color-text: #1a1a1a;
      --color-text-light: #6b6b6b;
      --color-text-lighter: #9b9b9b;
      --color-border: #e5e5e5;
      --color-bg: #ffffff;
      --color-bg-secondary: #fafafa;
      --color-accent: #2962ff;
      --max-width: 680px;
      --max-width-wide: 900px;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: var(--font-sans);
      font-size: 18px;
      line-height: 1.7;
      color: var(--color-text);
      background-color: var(--color-bg);
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    
    .container {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 4rem 2rem;
    }
    
    @media (min-width: 1200px) {
      .container {
        max-width: var(--max-width-wide);
      }
    }
    
    @media (min-width: 1600px) {
      .container {
        max-width: 1200px;
      }
    }
    
    .header {
      margin-bottom: 4rem;
      padding-bottom: 2rem;
      border-bottom: 1px solid var(--color-border);
    }
    
    h1 {
      font-family: var(--font-serif);
      font-size: 2.5rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--color-text);
      margin-bottom: 0.5rem;
      line-height: 1.15;
    }
    
    .subtitle {
      color: var(--color-text-light);
      font-size: 1rem;
      margin-top: 0.5rem;
    }
    
    .nav-btn {
      display: inline-block;
      margin-top: 1rem;
      font-size: 0.9rem;
      color: var(--color-text-light);
      text-decoration: none;
      transition: color 0.2s;
    }
    
    .nav-btn:hover {
      color: var(--color-text);
    }
    
    .article-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 3rem;
      margin-bottom: 4rem;
    }
    
    .article-item {
      border-bottom: 1px solid var(--color-border);
      padding-bottom: 2rem;
      transition: opacity 0.2s;
    }
    
    .article-item:last-child {
      border-bottom: none;
    }
    
    .article-item:hover {
      opacity: 0.8;
    }
    
    .article-title {
      font-family: var(--font-serif);
      font-size: 1.5rem;
      font-weight: 700;
      margin-bottom: 0.5rem;
      line-height: 1.3;
      letter-spacing: -0.02em;
    }
    
    .article-title a {
      color: var(--color-text);
      text-decoration: none;
    }
    
    .article-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      color: var(--color-text-lighter);
      font-size: 0.9rem;
      margin-top: 0.5rem;
    }
    
    .article-meta span {
      display: flex;
      align-items: center;
    }
    
    .stats {
      text-align: center;
      padding-top: 2rem;
      border-top: 1px solid var(--color-border);
      color: var(--color-text-lighter);
      font-size: 0.9rem;
    }

    @media (max-width: 768px) {
      body { font-size: 16px; }
      .container { padding: 2rem 1.5rem; }
      h1 { font-size: 2rem; }
      .article-title { font-size: 1.25rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Articles</h1>
      <p class="subtitle">Thoughts, stories and ideas</p>
      <a href="/" class="nav-btn">← Back to Home</a>
    </div>
    
    <ul class="article-list">
      ${sortedArticles.map(article => `
        <li class="article-item">
          <h2 class="article-title">
            <a href="${article.path}">${escapeHtml(article.title)}</a>
          </h2>
          <div class="article-meta">
            ${article.date ? `<span>${formatDate(article.date)}</span>` : ''}
            ${article.tags && article.tags.length > 0 ? `<span>· ${article.tags.join(' · ')}</span>` : ''}
          </div>
        </li>
      `).join('')}
    </ul>
    
    <div class="stats">
      ${sortedArticles.length} article${sortedArticles.length !== 1 ? 's' : ''}
    </div>
  </div>
</body>
</html>`;

  const listPath = path.join(distBlogDir, 'index.html');
  fs.writeFileSync(listPath, listHtml, 'utf-8');
}

function main(config = {}) {
  // Apply config
  GA4_MEASUREMENT_ID = config.ga4_measurement_id || "";

  // Check if source directory exists
  if (!fs.existsSync(blogDir)) {
    return [];
  }

  const stat = fs.statSync(blogDir);
  if (!stat.isDirectory()) {
    return [];
  }

  let files;
  try {
    files = fs.readdirSync(blogDir);
  } catch (error) {
    return [];
  }

  const markdownFiles = files.filter(file => file.endsWith('.md'));

  if (markdownFiles.length === 0) {
    return [];
  }

  if (!fs.existsSync(distBlogDir)) {
    fs.mkdirSync(distBlogDir, { recursive: true });
  }

  const results = [];

  markdownFiles.forEach((file) => {
    try {
      const filePath = path.join(blogDir, file);
      const result = processMarkdownFile(filePath);
      results.push(result);
    } catch (error) { }
  });

  if (results.length > 0) {
    generateListPage(results);
  }

  return results;
}

export { main };
