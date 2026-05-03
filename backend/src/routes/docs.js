const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { marked } = require('marked');

const router = express.Router();

const MANUAL_PATH = path.resolve(__dirname, '../../../docs/USER_MANUAL.md');
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../../docs/screenshots');

router.use('/screenshots', express.static(SCREENSHOTS_DIR));

const HTML_TEMPLATE = (title, body) => `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      font-size: 16px;
      line-height: 1.7;
      color: #1a2332;
      background: #f5f7fa;
    }

    .page {
      max-width: 860px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
    }

    header.doc-header {
      background: linear-gradient(135deg, #1a2332 0%, #2c4a2e 100%);
      color: #fff;
      padding: 2rem 1.5rem 1.5rem;
      margin-bottom: 2rem;
    }
    header.doc-header h1 {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    header.doc-header h1 span { color: #6fcf7f; }
    header.doc-header p { margin-top: 0.4rem; opacity: 0.75; font-size: 0.95rem; }

    h1 { display: none; } /* hide the first # heading — shown in header instead */
    h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #1a2332;
      margin: 2.5rem 0 0.75rem;
      padding-bottom: 0.35rem;
      border-bottom: 2px solid #e0e8e0;
    }
    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: #2c4a2e;
      margin: 1.75rem 0 0.5rem;
    }
    h4 {
      font-size: 1rem;
      font-weight: 600;
      margin: 1.5rem 0 0.4rem;
    }

    p { margin: 0.6rem 0; }

    a { color: #2c7a3e; text-decoration: none; }
    a:hover { text-decoration: underline; }

    ul, ol { margin: 0.5rem 0 0.5rem 1.5rem; }
    li { margin: 0.25rem 0; }

    strong { font-weight: 600; }
    em { font-style: italic; }

    code {
      font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace;
      font-size: 0.875em;
      background: #e8f0e8;
      color: #1a4a1a;
      padding: 0.15em 0.4em;
      border-radius: 4px;
    }

    pre {
      background: #1a2332;
      color: #d4e8d4;
      padding: 1rem 1.25rem;
      border-radius: 8px;
      overflow-x: auto;
      margin: 1rem 0;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    pre code {
      background: none;
      color: inherit;
      padding: 0;
      font-size: inherit;
    }

    blockquote {
      border-left: 3px solid #6fcf7f;
      background: #f0f7f0;
      padding: 0.75rem 1rem;
      margin: 1rem 0;
      border-radius: 0 6px 6px 0;
      color: #2c4a2e;
    }
    blockquote p { margin: 0.25rem 0; }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      font-size: 0.95rem;
    }
    th {
      background: #2c4a2e;
      color: #fff;
      text-align: left;
      padding: 0.6rem 0.9rem;
      font-weight: 600;
    }
    td {
      padding: 0.55rem 0.9rem;
      border-bottom: 1px solid #e0e8e0;
    }
    tr:nth-child(even) td { background: #f0f5f0; }

    hr {
      border: none;
      border-top: 1px solid #d0dcd0;
      margin: 2.5rem 0;
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.13);
      margin: 1rem 0 0.5rem;
      display: block;
    }

    .toc {
      background: #fff;
      border: 1px solid #d8e8d8;
      border-radius: 8px;
      padding: 1.25rem 1.5rem;
      margin: 1.5rem 0 2rem;
    }
    .toc ul { margin: 0.25rem 0 0 1.25rem; }
    .toc li { margin: 0.15rem 0; font-size: 0.95rem; }

    @media (max-width: 600px) {
      .page { padding: 1rem 1rem 3rem; }
      header.doc-header { padding: 1.25rem 1rem; }
      table { font-size: 0.85rem; }
      pre { font-size: 0.8rem; }
    }
  </style>
</head>
<body>
  <header class="doc-header">
    <div style="max-width:860px;margin:0 auto;">
      <h1><span>Route</span>Shred — Benutzerhandbuch</h1>
      <p>Vollständige Anleitung für Routenplanung, Export und Community-Features</p>
    </div>
  </header>
  <div class="page">${body}</div>
</body>
</html>`;

router.get('/manual', async (req, res) => {
  try {
    const markdown = await fs.readFile(MANUAL_PATH, 'utf8');
    const body = marked.parse(markdown);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(HTML_TEMPLATE('RouteShred — Benutzerhandbuch', body));
  } catch (err) {
    res.status(404).send('Handbuch nicht gefunden.');
  }
});

module.exports = router;
