/* ==========================================================================
   Vizualizador Offline — app v2
   Editor + live preview para Markdown, Mermaid, CSV, JSON y XML.
   Todo ocurre en el navegador: no hay red, ni backend, ni telemetría.
   ========================================================================== */

(() => {
  'use strict';

  /* ---------------------------------------------------------------- datos */

  const FORMATS = {
    md: { label: 'Markdown', kind: 'markdown' },
    markdown: { label: 'Markdown', kind: 'markdown' },
    mmd: { label: 'Mermaid', kind: 'mermaid' },
    mermaid: { label: 'Mermaid', kind: 'mermaid' },
    csv: { label: 'CSV', kind: 'csv' },
    tsv: { label: 'TSV', kind: 'csv' },
    json: { label: 'JSON', kind: 'json' },
    xml: { label: 'XML', kind: 'xml' },
    bpmn: { label: 'BPMN', kind: 'xml' },
    drawio: { label: 'draw.io', kind: 'xml' },
    puml: { label: 'PlantUML', kind: 'text' },
    c4: { label: 'C4', kind: 'text' },
    erd: { label: 'ERD', kind: 'text' },
    sql: { label: 'SQL', kind: 'text' },
    zen: { label: 'Zen', kind: 'text' },
    mm: { label: 'FreeMind', kind: 'text' },
    xmind: { label: 'XMind', kind: 'text' },
    mpp: { label: 'MS Project', kind: 'text' },
    vsdx: { label: 'Visio', kind: 'text' },
    txt: { label: 'Texto', kind: 'text' }
  };

  const STORAGE_KEY = 'vizualizador:workspace:v2';
  const THEME_KEY = 'vizualizador:theme';
  const MAX_PERSIST_BYTES = 1_500_000;

  const DEMO = `# 👋 Bienvenido al Vizualizador Offline

Escribe a la izquierda y **mira el resultado al instante** a la derecha.
Todo funciona sin conexión: los motores de render viajan dentro del repo.

## 🧭 Cómo se mueve un documento

\`\`\`mermaid
flowchart LR
  A([Archivo o tecleo]) --> B{Extensión}
  B -->|.md| C[marked + Mermaid]
  B -->|.mmd| D[Mermaid puro]
  B -->|.csv / .json| E[Tabla / Árbol]
  B -->|.xml / .bpmn| F[XML formateado]
  C & D & E & F --> G[[Preview en vivo]]
  G --> H{{Exportar PDF o PNG}}
\`\`\`

## 📊 Lo que entiende hoy

| Formato | Extensiones | Render |
| --- | --- | --- |
| Markdown | \`.md\` | GFM completo + diagramas embebidos |
| Mermaid | \`.mmd\` \`.mermaid\` | Diagrama en vivo |
| Datos | \`.csv\` \`.json\` | Tabla ordenable / árbol plegable |
| XML | \`.xml\` \`.bpmn\` \`.drawio\` | Formateado y coloreado |

## ⌨️ Atajos

- \`Ctrl + S\` — guardar el archivo activo
- \`Ctrl + P\` — exportar a PDF
- \`Ctrl + D\` — alternar tema claro / oscuro
- \`Ctrl + Shift + Z\` — restablecer el zoom del preview

> Arrastra cualquier archivo sobre la ventana para abrirlo.
> Nada sale de tu equipo: el documento vive en la memoria del navegador.

---

### Un diagrama más para jugar

\`\`\`mermaid
sequenceDiagram
  participant Tú
  participant Editor
  participant Preview
  Tú->>Editor: escribes una línea
  Editor->>Preview: render (debounce 120 ms)
  Preview-->>Tú: resultado visual
\`\`\`
`;

  /* ------------------------------------------------------------- elementos */

  const $ = (id) => document.getElementById(id);

  const el = {
    progress: $('progress'),
    editor: $('editor'),
    gutter: $('gutter'),
    preview: $('preview'),
    tabs: $('tabs'),
    status: $('status'),
    fileInput: $('fileInput'),
    newBtn: $('newBtn'),
    demoBtn: $('demoBtn'),
    saveBtn: $('saveBtn'),
    pickFolderBtn: $('pickFolderBtn'),
    exportPdfBtn: $('exportPdfBtn'),
    exportImgBtn: $('exportImgBtn'),
    clearBtn: $('clearBtn'),
    themeBtn: $('themeBtn'),
    zoomIn: $('zoomInBtn'),
    zoomOut: $('zoomOutBtn'),
    zoomReset: $('zoomResetBtn'),
    splitter: $('splitter'),
    dropzone: $('dropzone'),
    toasts: $('toasts'),
    fileBadge: $('fileBadge'),
    cursorInfo: $('cursorInfo'),
    renderTime: $('renderTime'),
    syncScroll: $('syncScroll'),
    netPill: $('netPill'),
    stats: {
      chars: $('statChars'),
      words: $('statWords'),
      lines: $('statLines'),
      headings: $('statHeadings'),
      tables: $('statTables'),
      diagrams: $('statDiagrams'),
      read: $('statRead'),
      folder: $('statFolder')
    }
  };

  const state = {
    files: [],
    activeId: null,
    folderHandle: null,
    theme: 'dark',
    zoom: 1,
    renderSeq: 0,
    mermaidSeq: 0,
    dragDepth: 0,
    lastDiagrams: 0
  };

  /* ------------------------------------------------------------ utilidades */

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  const extensionOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : 'txt');

  const formatOf = (ext) => FORMATS[ext] || { label: ext.toUpperCase() || 'TEXTO', kind: 'text' };

  const escapeHtml = (value = '') =>
    String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function setStatus(text) {
    el.status.textContent = text;
    el.status.classList.remove('flash');
    void el.status.offsetWidth;
    el.status.classList.add('flash');
  }

  function toast(message, type = '') {
    const node = document.createElement('div');
    node.className = `toast ${type}`.trim();
    node.innerHTML = `<span>${type === 'ok' ? '✅' : type === 'err' ? '⚠️' : 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
    el.toasts.append(node);
    setTimeout(() => {
      node.classList.add('out');
      node.addEventListener('animationend', () => node.remove(), { once: true });
    }, 3200);
  }

  function busy(on) {
    el.progress.classList.toggle('active', on);
    if (!on) setTimeout(() => (el.progress.style.width = ''), 350);
  }

  /* ------------------------------------------------------------- arranque */

  function boot() {
    marked.setOptions({ gfm: true, breaks: false });
    applyTheme(localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark', { silent: true });

    if (!restoreWorkspace()) {
      openDocument('bienvenida.md', DEMO, { silent: true });
    }

    wireEvents();
    updateNetPill();
    setStatus('Listo · escribe o arrastra un archivo');

    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* offline opcional: la app funciona igual */
      });
    }
  }

  function wireEvents() {
    el.fileInput.addEventListener('change', async (event) => {
      await addFiles([...event.target.files]);
      event.target.value = '';
    });

    el.editor.addEventListener('input', () => {
      const file = activeFile();
      if (file) file.text = el.editor.value;
      paintGutter();
      scheduleRender();
      persistWorkspace();
    });
    el.editor.addEventListener('keyup', updateCursorInfo);
    el.editor.addEventListener('click', updateCursorInfo);
    el.editor.addEventListener('scroll', () => {
      el.gutter.scrollTop = el.editor.scrollTop;
      syncPreviewScroll();
    });
    el.editor.addEventListener('keydown', handleTabKey);

    el.newBtn.addEventListener('click', () => {
      openDocument(`sin-titulo-${state.files.length + 1}.md`, '# Nuevo documento\n\n');
      el.editor.focus();
    });
    el.demoBtn.addEventListener('click', () => openDocument('bienvenida.md', DEMO));
    el.saveBtn.addEventListener('click', saveActive);
    el.pickFolderBtn.addEventListener('click', pickFolder);
    el.exportPdfBtn.addEventListener('click', () => window.print());
    el.exportImgBtn.addEventListener('click', exportPng);
    el.clearBtn.addEventListener('click', clearAll);
    el.themeBtn.addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));

    el.zoomIn.addEventListener('click', () => setZoom(state.zoom + 0.1));
    el.zoomOut.addEventListener('click', () => setZoom(state.zoom - 0.1));
    el.zoomReset.addEventListener('click', () => setZoom(1));

    el.splitter.addEventListener('pointerdown', startSplitDrag);
    el.splitter.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') nudgeSplit(-0.04);
      if (event.key === 'ArrowRight') nudgeSplit(0.04);
    });

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onShortcut);
    window.addEventListener('online', updateNetPill);
    window.addEventListener('offline', updateNetPill);
  }

  /* --------------------------------------------------------------- ficheros */

  const activeFile = () => state.files.find((f) => f.id === state.activeId) || null;

  async function addFiles(list) {
    let added = 0;
    for (const file of list) {
      const ext = extensionOf(file.name);
      let text;
      try {
        text = await file.text();
      } catch {
        toast(`No se pudo leer ${file.name}`, 'err');
        continue;
      }
      openDocument(file.name, text, { silent: true });
      added += 1;
    }
    if (added) {
      toast(`${added} archivo(s) abierto(s)`, 'ok');
      setStatus(`${state.files.length} archivo(s) en el espacio de trabajo`);
    } else {
      toast('Ningún archivo legible en la selección', 'err');
    }
  }

  function openDocument(name, text, { silent = false } = {}) {
    const ext = extensionOf(name);
    const file = { id: uid(), name, ext, text };
    state.files.push(file);
    state.activeId = file.id;
    renderTabs();
    loadActive();
    persistWorkspace();
    if (!silent) setStatus(`Abierto: ${name}`);
    return file;
  }

  function closeFile(id) {
    const index = state.files.findIndex((f) => f.id === id);
    if (index === -1) return;
    const [removed] = state.files.splice(index, 1);
    if (state.activeId === id) {
      const next = state.files[index] || state.files[index - 1] || null;
      state.activeId = next ? next.id : null;
    }
    renderTabs();
    if (state.activeId) loadActive();
    else resetEditor();
    persistWorkspace();
    setStatus(`Cerrado: ${removed.name}`);
  }

  function clearAll() {
    if (!state.files.length) return;
    state.files = [];
    state.activeId = null;
    renderTabs();
    resetEditor();
    persistWorkspace();
    toast('Espacio de trabajo vacío', 'ok');
  }

  function resetEditor() {
    el.editor.value = '';
    el.fileBadge.textContent = '—';
    paintGutter();
    renderEmptyState();
    updateStats('');
  }

  function loadActive() {
    const file = activeFile();
    if (!file) return resetEditor();
    el.editor.value = file.text;
    el.fileBadge.textContent = formatOf(file.ext).label;
    paintGutter();
    updateCursorInfo();
    renderNow();
  }

  function renderTabs() {
    el.tabs.innerHTML = '';
    state.files.forEach((file) => {
      const tab = document.createElement('div');
      tab.className = `tab${file.id === state.activeId ? ' active' : ''}`;
      tab.title = `${file.name} · ${formatOf(file.ext).label}`;

      const name = document.createElement('span');
      name.className = 'tab-name';
      name.textContent = file.name;

      const close = document.createElement('button');
      close.className = 'tab-close';
      close.type = 'button';
      close.textContent = '×';
      close.title = 'Cerrar';
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        closeFile(file.id);
      });

      tab.append(name, close);
      tab.addEventListener('click', () => {
        if (state.activeId === file.id) return;
        state.activeId = file.id;
        renderTabs();
        loadActive();
      });
      el.tabs.append(tab);
    });
  }

  /* ------------------------------------------------------------- editor UI */

  function paintGutter() {
    const total = el.editor.value.split('\n').length;
    const rows = [];
    for (let i = 1; i <= total; i += 1) rows.push(i);
    el.gutter.textContent = rows.join('\n');
    el.gutter.scrollTop = el.editor.scrollTop;
  }

  function updateCursorInfo() {
    const upto = el.editor.value.slice(0, el.editor.selectionStart);
    const lines = upto.split('\n');
    el.cursorInfo.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
  }

  function handleTabKey(event) {
    if (event.key !== 'Tab' || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    const start = el.editor.selectionStart;
    const end = el.editor.selectionEnd;
    el.editor.setRangeText('  ', start, end, 'end');
    el.editor.dispatchEvent(new Event('input'));
  }

  function syncPreviewScroll() {
    if (!el.syncScroll.checked) return;
    const max = el.editor.scrollHeight - el.editor.clientHeight;
    if (max <= 0) return;
    const ratio = el.editor.scrollTop / max;
    el.preview.scrollTop = ratio * (el.preview.scrollHeight - el.preview.clientHeight);
  }

  /* ------------------------------------------------------------- render */

  const scheduleRender = debounce(() => renderNow(), 120);

  async function renderNow() {
    const file = activeFile();
    const text = el.editor.value;
    updateStats(text);

    if (!file && !text.trim()) return renderEmptyState();

    const seq = ++state.renderSeq;
    const started = performance.now();
    busy(true);

    const kind = formatOf(file ? file.ext : 'md').kind;
    const layer = document.createElement('div');
    layer.className = 'zoom-layer';
    layer.style.zoom = state.zoom;

    try {
      if (kind === 'markdown') await renderMarkdown(text, layer);
      else if (kind === 'mermaid') await renderMermaidOnly(text, layer);
      else if (kind === 'csv') renderCsv(text, layer, file ? file.ext : 'csv');
      else if (kind === 'json') renderJson(text, layer);
      else if (kind === 'xml') renderXml(text, layer);
      else renderPlain(text, layer, file ? file.ext : 'txt');
    } catch (error) {
      layer.innerHTML = `<div class="mermaid-error"><strong>Error de render</strong><pre>${escapeHtml(error.message || error)}</pre></div>`;
    }

    if (seq !== state.renderSeq) return; // llegó un render más reciente

    el.preview.replaceChildren(layer);
    el.preview.classList.remove('fade-in');
    void el.preview.offsetWidth;
    el.preview.classList.add('fade-in');

    const elapsed = Math.round(performance.now() - started);
    el.renderTime.textContent = `${elapsed} ms`;
    countDiagrams(layer);
    busy(false);
  }

  function renderEmptyState() {
    el.preview.replaceChildren();
    const box = document.createElement('div');
    box.className = 'empty-state';
    box.innerHTML = `
      <div class="big">🗺️</div>
      <strong>Nada que mostrar todavía</strong>
      <span>Pulsa <b>Nuevo</b>, abre un archivo o arrastra uno sobre la ventana.</span>
      <span>¿Quieres ver de qué es capaz? Pulsa <b>Demo</b>.</span>`;
    el.preview.append(box);
    el.renderTime.textContent = '0 ms';
  }

  async function renderMarkdown(md, container) {
    container.innerHTML = marked.parse(md || '');
    const blocks = container.querySelectorAll('code.language-mermaid, code.language-mmd');
    for (const block of blocks) {
      const pre = block.closest('pre') || block;
      const code = block.textContent;
      pre.replaceWith(await mermaidNode(code));
    }
  }

  async function renderMermaidOnly(code, container) {
    container.append(await mermaidNode(code));
  }

  async function mermaidNode(code) {
    const wrap = document.createElement('div');
    try {
      const id = `merm-${Date.now().toString(36)}-${state.mermaidSeq++}`;
      const { svg } = await mermaid.render(id, code.trim());
      wrap.className = 'mermaid-wrap';
      wrap.innerHTML = svg;
    } catch (error) {
      wrap.className = 'mermaid-error';
      wrap.innerHTML = `<strong>Mermaid no pudo dibujar este bloque</strong>
        <pre>${escapeHtml((error && error.message) || 'Sintaxis inválida')}</pre>
        <pre><code>${escapeHtml(code)}</code></pre>`;
    }
    return wrap;
  }

  function renderCsv(raw, container, ext) {
    const rows = parseDelimited(raw, ext === 'tsv' ? '\t' : detectDelimiter(raw));
    if (!rows.length) {
      container.innerHTML = '<p class="muted">Archivo de datos vacío.</p>';
      return;
    }
    const [head, ...body] = rows;
    const table = document.createElement('table');
    table.innerHTML =
      `<thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>` +
      `<tbody>${body
        .map((row) => `<tr>${head.map((_, i) => `<td>${escapeHtml(row[i] ?? '')}</td>`).join('')}</tr>`)
        .join('')}</tbody>`;

    container.append(
      viewerHead([
        `${body.length} filas`,
        `${head.length} columnas`,
        `delimitador «${ext === 'tsv' ? 'tab' : detectDelimiter(raw)}»`
      ]),
      table
    );
  }

  function detectDelimiter(raw) {
    const line = raw.split(/\r?\n/, 1)[0] || '';
    const counts = [',', ';', '\t', '|'].map((d) => [d, line.split(d).length - 1]);
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 0 ? counts[0][0] : ',';
  }

  function parseDelimited(raw, delimiter) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    const text = raw.replace(/\r\n?/g, '\n').trim();

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else value += char;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === delimiter) { row.push(value); value = ''; }
      else if (char === '\n') { row.push(value); rows.push(row); row = []; value = ''; }
      else value += char;
    }
    if (value !== '' || row.length) { row.push(value); rows.push(row); }
    return rows;
  }

  function renderJson(raw, container) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      container.innerHTML = `<div class="mermaid-error"><strong>JSON inválido</strong><pre>${escapeHtml(error.message)}</pre></div>`;
      return;
    }
    const tree = document.createElement('div');
    tree.className = 'json-tree';
    tree.innerHTML = jsonToHtml(data, null, 0);
    container.append(viewerHead([`${countNodes(data)} nodos`, `tipo raíz: ${Array.isArray(data) ? 'array' : typeof data}`]), tree);
  }

  function jsonToHtml(value, key, depth) {
    const label = key === null ? '' : `<span class="json-key">"${escapeHtml(key)}"</span>: `;
    if (value === null) return `<div class="json-row">${label}<span class="json-null">null</span></div>`;
    if (Array.isArray(value)) {
      const items = value.map((item, index) => jsonToHtml(item, String(index), depth + 1)).join('');
      return `<details ${depth < 2 ? 'open' : ''}><summary>${label}[ ] <span class="json-count">${value.length} elementos</span></summary>${items}</details>`;
    }
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      const items = keys.map((k) => jsonToHtml(value[k], k, depth + 1)).join('');
      return `<details ${depth < 2 ? 'open' : ''}><summary>${label}{ } <span class="json-count">${keys.length} claves</span></summary>${items}</details>`;
    }
    const cls = typeof value === 'string' ? 'json-string' : typeof value === 'number' ? 'json-number' : 'json-boolean';
    const shown = typeof value === 'string' ? `"${value}"` : String(value);
    return `<div class="json-row">${label}<span class="${cls}">${escapeHtml(shown)}</span></div>`;
  }

  function countNodes(value) {
    if (value === null || typeof value !== 'object') return 1;
    return Object.values(value).reduce((total, item) => total + countNodes(item), 1);
  }

  function renderXml(raw, container) {
    const pretty = prettyXml(raw);
    const tags = (raw.match(/<[a-zA-Z_][^\s/>]*/g) || []).length;
    const pre = document.createElement('pre');
    pre.innerHTML = `<code class="code-lines">${pretty
      .split('\n')
      .map((line) => `<span class="cl">${highlightXml(line)}</span>`)
      .join('')}</code>`;
    container.append(viewerHead([`${tags} etiquetas`, `${pretty.split('\n').length} líneas formateadas`]), pre);
  }

  function prettyXml(xml) {
    const compact = xml.replace(/>\s+</g, '><').trim();
    let depth = 0;
    return compact
      .replace(/></g, '>\n<')
      .split('\n')
      .map((line) => {
        if (/^<\/.+/.test(line)) depth = Math.max(0, depth - 1);
        const out = '  '.repeat(depth) + line;
        if (/^<[^!?/][^>]*[^/]>$/.test(line) && !/^<.+<\/.+>$/.test(line)) depth += 1;
        return out;
      })
      .join('\n');
  }

  function highlightXml(line) {
    return escapeHtml(line)
      .replace(/&lt;(\/?[\w:.-]+)/g, '&lt;<span class="xml-tag">$1</span>')
      .replace(/([\w:.-]+)=(&quot;.*?&quot;)/g, '<span class="xml-attr">$1</span>=<span class="xml-val">$2</span>');
  }

  function renderPlain(text, container, ext) {
    const pre = document.createElement('pre');
    pre.innerHTML = `<code class="code-lines">${text
      .split('\n')
      .map((line) => `<span class="cl">${escapeHtml(line) || ' '}</span>`)
      .join('')}</code>`;
    container.append(
      viewerHead([formatOf(ext).label, `${text.split('\n').length} líneas`, 'vista textual'], 'Sin renderer gráfico para este formato'),
      pre
    );
  }

  function viewerHead(chips, note) {
    const head = document.createElement('div');
    head.className = 'viewer-head';
    head.innerHTML =
      chips.map((chip, index) => `<span class="chip${index === 0 ? ' chip-accent' : ''}">${escapeHtml(chip)}</span>`).join('') +
      (note ? `<span class="chip">${escapeHtml(note)}</span>` : '');
    return head;
  }

  /* ------------------------------------------------------------ estadística */

  function updateStats(text) {
    const lines = text ? text.split('\n').length : 0;
    const words = text ? (text.trim().match(/\S+/g) || []).length : 0;
    const headings = (text.match(/^#{1,6}\s+\S/gm) || []).length;
    const tables = (text.match(/^\s*\|.+\|\s*$/gm) || []).length ? countTables(text) : 0;
    const diagrams = (text.match(/```(mermaid|mmd)/g) || []).length;

    setStat('chars', text.length);
    setStat('words', words);
    setStat('lines', lines);
    setStat('headings', headings);
    setStat('tables', tables);
    setStat('diagrams', diagrams);
    setStat('read', Math.max(words ? 1 : 0, Math.round(words / 200)));
  }

  function countTables(text) {
    return (text.match(/^\s*\|[\s:|-]+\|\s*$/gm) || []).length;
  }

  function setStat(key, value) {
    const node = el.stats[key];
    if (!node || node.textContent === String(value)) return;
    node.textContent = value;
    const parent = node.closest('.stat');
    parent.classList.remove('bump');
    void parent.offsetWidth;
    parent.classList.add('bump');
  }

  function countDiagrams(container) {
    const total = container.querySelectorAll('.mermaid-wrap').length;
    if (total && total !== state.lastDiagrams) {
      state.lastDiagrams = total;
      setStatus(`${total} diagrama(s) dibujado(s)`);
    }
  }

  /* ------------------------------------------------------------ tema y zoom */

  function applyTheme(theme, { silent = false } = {}) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    el.themeBtn.querySelector('.btn-ico').textContent = theme === 'dark' ? '🌙' : '☀️';
    el.themeBtn.querySelector('.btn-label').textContent = theme === 'dark' ? 'Dark' : 'Light';
    localStorage.setItem(THEME_KEY, theme);

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: theme === 'dark' ? 'default' : 'neutral',
      flowchart: { curve: 'basis', useMaxWidth: true }
    });

    if (!silent) {
      renderNow();
      setStatus(`Tema ${theme === 'dark' ? 'oscuro' : 'claro'}`);
    }
  }

  function setZoom(value) {
    state.zoom = Math.min(2.5, Math.max(0.5, Math.round(value * 10) / 10));
    el.zoomReset.textContent = `${Math.round(state.zoom * 100)}%`;
    const layer = el.preview.querySelector('.zoom-layer');
    if (layer) layer.style.zoom = state.zoom;
  }

  function nudgeSplit(delta) {
    const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--split') || '0.5');
    setSplit(current + delta);
  }

  function setSplit(fraction) {
    const clamped = Math.min(0.8, Math.max(0.2, fraction));
    document.documentElement.style.setProperty('--split', clamped);
    document.documentElement.style.setProperty('--editor-fraction', `${clamped}fr`);
  }

  function startSplitDrag(event) {
    if (window.innerWidth <= 980) return;
    event.preventDefault();
    el.splitter.classList.add('dragging');
    el.splitter.setPointerCapture(event.pointerId);

    const workspace = document.getElementById('workspace');
    const move = (moveEvent) => {
      const rect = workspace.getBoundingClientRect();
      setSplit((moveEvent.clientX - rect.left) / rect.width);
    };
    const stop = () => {
      el.splitter.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
  }

  /* ------------------------------------------------------- guardar/exportar */

  async function pickFolder() {
    if (!window.showDirectoryPicker) {
      toast('La API de carpetas solo está en Chrome/Edge de escritorio', 'err');
      return;
    }
    try {
      state.folderHandle = await window.showDirectoryPicker();
      el.stats.folder.textContent = `Carpeta: ${state.folderHandle.name}`;
      toast(`Guardaré en «${state.folderHandle.name}»`, 'ok');
    } catch {
      /* el usuario canceló el diálogo */
    }
  }

  async function saveActive() {
    const file = activeFile();
    if (!file) return toast('No hay archivo activo', 'err');
    file.text = el.editor.value;

    if (state.folderHandle) {
      try {
        const handle = await state.folderHandle.getFileHandle(file.name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.text);
        await writable.close();
        toast(`Guardado en ${state.folderHandle.name}/${file.name}`, 'ok');
        return;
      } catch (error) {
        toast(`No se pudo escribir en la carpeta: ${error.message}`, 'err');
      }
    }
    downloadBlob(new Blob([file.text], { type: 'text/plain;charset=utf-8' }), file.name);
    toast(`Descargado: ${file.name}`, 'ok');
  }

  async function exportPng() {
    const svg = el.preview.querySelector('.mermaid-wrap svg');
    busy(true);
    try {
      const blob = svg ? await svgToPng(svg) : await textToPng();
      const name = `${(activeFile()?.name || 'preview').replace(/\.[^.]+$/, '')}.png`;
      if (state.folderHandle) {
        const handle = await state.folderHandle.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        toast(`PNG guardado en ${state.folderHandle.name}/${name}`, 'ok');
      } else {
        downloadBlob(blob, name);
        toast(`PNG exportado: ${name}`, 'ok');
      }
    } catch (error) {
      toast(`No se pudo exportar PNG: ${error.message}`, 'err');
    } finally {
      busy(false);
    }
  }

  function svgToPng(svg) {
    return new Promise((resolve, reject) => {
      const clone = svg.cloneNode(true);
      const box = svg.getBoundingClientRect();
      const width = Math.max(320, Math.round(box.width || 800));
      const height = Math.max(200, Math.round(box.height || 600));
      clone.setAttribute('width', width);
      clone.setAttribute('height', height);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const source = new XMLSerializer().serializeToString(clone);
      const image = new Image();
      image.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas vacío'))), 'image/png');
      };
      image.onerror = () => reject(new Error('el SVG no se pudo rasterizar'));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
    });
  }

  function textToPng() {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    const dark = state.theme === 'dark';

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, dark ? '#08142c' : '#ffffff');
    gradient.addColorStop(1, dark ? '#12284b' : '#e4edff');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = dark ? '#eabf65' : '#8f6204';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(activeFile()?.name || 'Vizualizador Offline', 40, 58);

    ctx.fillStyle = dark ? '#a3b6db' : '#47638f';
    ctx.font = '16px sans-serif';
    ctx.fillText(new Date().toLocaleString(), 40, 84);

    ctx.fillStyle = dark ? '#eaf1ff' : '#102546';
    ctx.font = '16px ui-monospace, monospace';
    el.editor.value
      .split('\n')
      .slice(0, 46)
      .forEach((line, index) => ctx.fillText(line.slice(0, 150), 40, 126 + index * 19));

    return new Promise((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas vacío'))), 'image/png')
    );
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ------------------------------------------------------- drag & drop / UX */

  function onDragEnter(event) {
    if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
    event.preventDefault();
    state.dragDepth += 1;
    el.dropzone.classList.add('visible');
  }

  function onDragLeave() {
    state.dragDepth = Math.max(0, state.dragDepth - 1);
    if (!state.dragDepth) el.dropzone.classList.remove('visible');
  }

  async function onDrop(event) {
    event.preventDefault();
    state.dragDepth = 0;
    el.dropzone.classList.remove('visible');
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) await addFiles(files);
  }

  function onShortcut(event) {
    if (!event.ctrlKey && !event.metaKey) return;
    const key = event.key.toLowerCase();
    if (key === 's') { event.preventDefault(); saveActive(); }
    else if (key === 'p') { event.preventDefault(); window.print(); }
    else if (key === 'd') { event.preventDefault(); applyTheme(state.theme === 'dark' ? 'light' : 'dark'); }
    else if (key === 'z' && event.shiftKey) { event.preventDefault(); setZoom(1); }
  }

  function updateNetPill() {
    const online = navigator.onLine;
    el.netPill.textContent = online ? 'Offline ready' : 'Sin conexión · todo sigue';
    el.netPill.classList.toggle('offline', !online);
  }

  /* ------------------------------------------------------------ persistencia */

  const persistWorkspace = debounce(() => {
    try {
      const payload = JSON.stringify({ activeId: state.activeId, files: state.files });
      if (payload.length > MAX_PERSIST_BYTES) return;
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      /* cuota llena: seguimos sin persistir */
    }
  }, 600);

  function restoreWorkspace() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!Array.isArray(data.files) || !data.files.length) return false;
      state.files = data.files;
      state.activeId = data.files.some((f) => f.id === data.activeId) ? data.activeId : data.files[0].id;
      renderTabs();
      loadActive();
      setStatus(`Sesión restaurada · ${state.files.length} archivo(s)`);
      return true;
    } catch {
      return false;
    }
  }

  /* -------------------------------------------------------------- ejecución */

  setSplit(0.5);
  boot();
})();
