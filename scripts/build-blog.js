#!/usr/bin/env node
/* HEIGA Studios — blog build script (vanilla Node, no deps)
   Reads site/content/blog/*.md -> generates:
   - site/blog/index.html (index with search)
   - site/blog/<slug>/index.html (per post, full SEO)
   - updates home LATEST FROM THE BLOG section
   - site/sitemap.xml, site/robots.txt, site/_redirects
   Run: node scripts/build-blog.js  (from site/ dir or repo root) */
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = __dirname + '/..';
const BASE = 'https://www.heigastudios.com';
const CONTENT = path.join(SITE, 'content/blog');

/* ---------- frontmatter (small YAML subset) ---------- */
function parsePost(file){
  let raw = fs.readFileSync(file, 'utf8');
  // skip leading HTML comments, find first --- block
  const m = raw.match(/---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) throw new Error('No frontmatter in ' + file);
  const fm = {};
  let cur = null;
  m[1].split(/\r?\n/).forEach(line => {
    let t = line.match(/^(\w+):\s*(.*)$/);
    if (t){ cur = t[1]; fm[cur] = t[2].trim() === '' ? {} : parseVal(t[2]); return; }
    let sub = line.match(/^\s{2}(\w+):\s*(.*)$/);
    if (sub && cur && typeof fm[cur] === 'object' && !Array.isArray(fm[cur])){
      fm[cur][sub[1]] = parseVal(sub[2]);
    }
  });
  const body = raw.slice(m[0].length).trim();
  const seo = fm.seo || {};
  const slug = seo.slug || path.basename(file, '.md');
  return {
    title: fm.title || 'Untitled',
    date: fm.date || '2026-01-01',
    cover: fm.cover || '/assets/img/f-18-work-1.jpg',
    cover_alt: fm.cover_alt || fm.title || 'Heiga Studios',
    excerpt: fm.excerpt || '',
    author: fm.author || 'Heiga Studios',
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    seo_title: seo.seo_title || fm.title || 'Untitled',
    seo_description: seo.seo_description || '',
    og_image: seo.og_image || fm.cover || '/assets/img/f-18-work-1.jpg',
    slug, body
  };
}
function parseVal(v){
  v = (v || '').trim();
  if (v.startsWith('[')) return v.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return v.replace(/^["']|["']$/g, '');
}

/* ---------- minimal markdown -> HTML ---------- */
function md(src){
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = s => {
    // keep existing HTML comments / tags untouched
    const tokens = [];
    s = s.replace(/<!--[\s\S]*?-->/g, m => { tokens.push(m); return '\u0000'+(tokens.length-1)+'\u0000'; });
    s = esc(s);
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|\W)\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\u0000(\d+)\u0000/g, (mm,i) => tokens[+i]);
    return s;
  };
  const lines = src.split(/\r?\n/);
  let html = '', inList = false, para = [];
  const flush = () => {
    if (para.length){ html += '<p>' + inline(para.join(' ')) + '</p>\n'; para = []; }
    if (inList){ html += '</ul>\n'; inList = false; }
  };
  for (const line of lines){
    if (/^\s*$/.test(line)){ flush(); continue; }
    let h = line.match(/^(#{2,3})\s+(.*)/);
    if (h){ flush(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>\n`; continue; }
    if (/^---+$/.test(line.trim())){ flush(); html += '<hr>\n'; continue; }
    let q = line.match(/^>\s?(.*)/);
    if (q){ flush(); html += `<blockquote><p>${inline(q[1])}</p></blockquote>\n`; continue; }
    let li = line.match(/^[-*]\s+(.*)/);
    if (li){ if(!inList){ html += '<ul>\n'; inList = true; } html += `<li>${inline(li[1])}</li>\n`; continue; }
    if (/^<!--/.test(line.trim())){ flush(); html += line.trim() + '\n'; continue; }
    if (/^</.test(line.trim())){ flush(); html += line + '\n'; continue; }
    para.push(line.trim());
  }
  flush();
  return html;
}

function stripMd(s){
  return s.replace(/<!--[\s\S]*?-->/g,'').replace(/[#>*`\[\]()!-]/g,'').replace(/\s+/g,' ').trim();
}
function fmtDate(d){
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const [y,mo,da] = d.split('-').map(Number);
  return `${M[mo-1]} ${da}, ${y}`;
}

/* ---------- shared chrome ---------- */
/* Relative prefix so the site works at any base path (GitHub Pages subpath,
   localhost, or a root domain). Depth: 0 = home, 1 = sections, 2 = posts/cases. */
const RP = d => d === 0 ? './' : '../'.repeat(d);
const headExtra = d => { const rp = RP(d); return `
<link rel="icon" type="image/png" href="${rp}assets/img/logo.png">
<link rel="stylesheet" href="${rp}assets/css/fonts.css">
<link rel="stylesheet" href="${rp}assets/css/style.css">
<script src="${rp}assets/js/vendor/lenis.min.js" defer></script>
<script src="${rp}assets/js/main.js" defer></script>`; };
const header = d => { const rp = RP(d); return `
<header class="site-header">
  <a class="brand" href="${rp}" aria-label="Heiga Studios — home">HEIGA</a>
  <button class="menu-btn" data-menu-open aria-label="Open menu">MENU</button>
</header>
<div class="scrim" id="scrim"></div>
<aside class="drawer" id="drawer" aria-label="Site menu">
  <button class="drawer-close" data-menu-close>CLOSE</button>
  <nav>
    <a class="drawer-link" href="${rp}"><span class="roll"><span>HOME</span><span>HOME</span></span></a>
    <a class="drawer-link" href="${rp}about/"><span class="roll"><span>ABOUT</span><span>ABOUT</span></span></a>
    <a class="drawer-link" href="${rp}services/"><span class="roll"><span>SERVICES</span><span>SERVICES</span></span></a>
    <a class="drawer-link" href="${rp}studio/"><span class="roll"><span>STUDIO</span><span>STUDIO</span></span></a>
    <a class="drawer-link" href="${rp}work/"><span class="roll"><span>WORK</span><span>WORK</span></span></a>
    <a class="drawer-link" href="${rp}blog/"><span class="roll"><span>BLOG</span><span>BLOG</span></span></a>
    <a class="drawer-link" href="${rp}contact/"><span class="roll"><span>CONTACT</span><span>CONTACT</span></span></a>
  </nav>
  <div class="social"><a href="https://www.instagram.com/HEIGASTUDIOS" target="_blank" rel="noopener">@HEIGASTUDIOS</a></div>
</aside>`; };
const footer = d => { const rp = RP(d); return `
  <footer>
    <div class="foot-pin" aria-hidden="true"><div class="wordmark">HEIGA</div></div>
    <div class="foot-body">
      <div class="foot-brand"><img src="${rp}assets/img/logo.png" alt="Heiga Studios logo" width="220" height="220" loading="lazy"></div>
      <div class="foot-grid">
        <div><h4>CONTACT</h4><address>168 SE 1st St #500, Miami,<br>FL 33131, USA.<br>
        <a href="mailto:info@heigastudios.com">info@heigastudios.com</a><br>
        <a href="tel:+17862121591">(786) 212-1591</a></address></div>
        <nav aria-label="Footer"><h4>MENU</h4>
          <div class="foot-nav"><a href="${rp}about/">About</a><a href="${rp}services/">Services</a><a href="${rp}studio/">Studio</a><a href="${rp}work/">Work</a><a href="${rp}blog/">Blog</a><a href="${rp}contact/">Contact</a></div>
        </nav>
        <div><h4>SOCIAL</h4><div class="foot-nav"><a href="https://www.instagram.com/HEIGASTUDIOS" target="_blank" rel="noopener">@HEIGASTUDIOS</a></div></div>
      </div>
      <div class="foot-bottom"><span>© 2026 HEIGA STUDIOS</span><span>SITE BY MUVIPROJECT</span></div>
    </div>
  </footer>`; };

/* ---------- load posts ---------- */
if (!fs.existsSync(CONTENT)) { console.error('No content dir'); process.exit(1); }
const posts = fs.readdirSync(CONTENT).filter(f => f.endsWith('.md'))
  .map(f => parsePost(path.join(CONTENT, f)))
  .sort((a,b) => b.date.localeCompare(a.date));
posts.forEach(p => {
  if (!p.excerpt) p.excerpt = stripMd(p.body).slice(0, 155);
  if (!p.seo_description) p.seo_description = p.excerpt.slice(0, 155);
});
console.log(`Posts: ${posts.length}`);

/* ---------- blog index (depth 1) ---------- */
const RP1 = RP(1);
const rows = posts.map(p => `
        <a class="blog-row reveal in" href="${RP1}blog/${p.slug}/" data-search="${(p.title+' '+p.excerpt+' '+p.tags.join(' ')).replace(/"/g,'&quot;')}">
          <img src="${RP1}${p.cover.slice(1)}" alt="${p.cover_alt.replace(/"/g,'&quot;')}" width="560" height="350" loading="lazy">
          <div>
            <p class="meta">${fmtDate(p.date)} · ${p.tags.join(' · ').toUpperCase() || 'NEWS'}</p>
            <h2>${p.title}</h2>
            <p>${p.excerpt}</p>
          </div>
        </a>`).join('\n');

const blogIndex = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Blog | Heiga Studios — News from our Miami Studio</title>
<meta name="description" content="News, session stories and press from Heiga Studios, our Downtown Miami recording studio.">
<link rel="canonical" href="${BASE}/blog/">
<meta name="robots" content="index, follow">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Heiga Studios">
<meta property="og:title" content="Blog | Heiga Studios">
<meta property="og:description" content="News, session stories and press from Heiga Studios Miami.">
<meta property="og:url" content="${BASE}/blog/">
<meta property="og:image" content="${BASE}/assets/img/f-01-hero.jpg">
<meta name="twitter:card" content="summary_large_image">${headExtra(1)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
{"@type":"ListItem","position":1,"name":"Home","item":"${BASE}/"},
{"@type":"ListItem","position":2,"name":"Blog","item":"${BASE}/blog/"}]}
</script>
</head>
<body>${header(1)}
<main>
  <section class="page-hero">
    <p class="eyebrow">NEWS &amp; STORIES</p>
    <h1>THE <span class="accent">BLOG.</span></h1>
  </section>
  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="search"><input id="blog-search" type="search" placeholder="Search posts…" aria-label="Search posts"></div>
      <div class="blog-list">
${rows}
      </div>
    </div>
  </section>${footer(1)}
</main>
</body>
</html>`;
fs.writeFileSync(path.join(SITE, 'blog/index.html'), blogIndex);
console.log('blog/index.html written');

/* ---------- post pages (depth 2) ---------- */
const RP2 = RP(2);
posts.forEach(p => {
  const dir = path.join(SITE, 'blog', p.slug);
  fs.mkdirSync(dir, { recursive: true });
  const url = `${BASE}/blog/${p.slug}/`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p.seo_title}</title>
<meta name="description" content="${p.seo_description.replace(/"/g,'&quot;')}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Heiga Studios">
<meta property="og:title" content="${p.seo_title.replace(/"/g,'&quot;')}">
<meta property="og:description" content="${p.seo_description.replace(/"/g,'&quot;')}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${BASE}${p.og_image}">
<meta property="article:published_time" content="${p.date}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${BASE}${p.og_image}">${headExtra(2)}
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BlogPosting",
"headline":"${p.title.replace(/"/g,'\\"')}",
"datePublished":"${p.date}","author":{"@type":"Organization","name":"${p.author}"},
"image":"${BASE}${p.cover}","url":"${url}",
"description":"${p.seo_description.replace(/"/g,'\\"')}"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[
{"@type":"ListItem","position":1,"name":"Home","item":"${BASE}/"},
{"@type":"ListItem","position":2,"name":"Blog","item":"${BASE}/blog/"},
{"@type":"ListItem","position":3,"name":"${p.title.replace(/"/g,'\\"')}","item":"${url}"}]}
</script>
</head>
<body>${header(2)}
<main>
  <a class="back-link" href="${RP2}blog/">← ALL POSTS</a>
  <article>
    <div class="post-body" style="padding-bottom:0">
      <p class="meta">${fmtDate(p.date)} · BY ${p.author.toUpperCase()}${p.tags.length ? ' · ' + p.tags.join(' · ').toUpperCase() : ''}</p>
      <h1>${p.title}</h1>
    </div>
    <figure class="post-hero"><img src="${RP2}${p.cover.slice(1)}" alt="${p.cover_alt.replace(/"/g,'&quot;')}" width="1920" height="1080"></figure>
    <div class="post-body">
${md(p.body)}
    </div>
  </article>${footer(2)}
</main>
</body>
</html>`;
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`blog/${p.slug}/ written`);
});

/* ---------- home LATEST section ---------- */
const homePath = path.join(SITE, 'index.html');
let home = fs.readFileSync(homePath, 'utf8');
/* ---------- home LATEST section (depth 0) ---------- */
const RP0 = RP(0);
const cards = posts.slice(0, 3).map(p => `
        <a class="post-card reveal" href="${RP0}blog/${p.slug}/">
          <img src="${RP0}${p.cover.slice(1)}" alt="${p.cover_alt.replace(/"/g,'&quot;')}" loading="lazy">
          <p class="meta">${fmtDate(p.date)}</p>
          <h3>${p.title}</h3>
          <p>${p.excerpt}</p>
        </a>`).join('\n');
const latest = `      <div class="blog-grid">\n${cards}\n      </div>`;
home = home.replace(/<!-- BLOG-LATEST-START -->[\s\S]*?<!-- BLOG-LATEST-END -->/,
  `<!-- BLOG-LATEST-START -->\n${latest}\n      <!-- BLOG-LATEST-END -->`);
fs.writeFileSync(homePath, home);
console.log('home LATEST updated');

/* ---------- sitemap / robots / redirects ---------- */
const staticPages = [
  ['/', 'weekly', '1.0'], ['/about/', 'monthly', '0.8'], ['/services/', 'monthly', '0.8'],
  ['/studio/', 'monthly', '0.8'], ['/work/', 'monthly', '0.8'], ['/blog/', 'weekly', '0.8'],
  ['/contact/', 'monthly', '0.8'],
  ['/work/velvet-dusk/', 'monthly', '0.6'], ['/work/neon-district/', 'monthly', '0.6'],
  ['/work/morning-podcast/', 'monthly', '0.6'], ['/work/atmos-sessions/', 'monthly', '0.6'],
];
const urls = staticPages.map(([loc, cf, pr]) =>
  `  <url><loc>${BASE}${loc}</loc><changefreq>${cf}</changefreq><priority>${pr}</priority></url>`
).concat(posts.map(p =>
  `  <url><loc>${BASE}/blog/${p.slug}/</loc><lastmod>${p.date}</lastmod><changefreq>monthly</changefreq><priority>0.7</priority></url>`
));
fs.writeFileSync(path.join(SITE, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(SITE, 'robots.txt'),
  `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${BASE}/sitemap.xml\n`);
fs.writeFileSync(path.join(SITE, '_redirects'), `/post/* /blog/:splat 301\n`);
console.log('sitemap.xml, robots.txt, _redirects written');
console.log('BUILD OK');
