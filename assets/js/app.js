(() => {
  const supported = new Set(['md', 'mmd', 'mermaid', 'puml', 'drawio', 'vsdx', 'erd', 'sql', 'mm', 'xmind', 'c4', 'mpp', 'csv', 'json', 'zen', 'bpmn', 'xml']);
  const state = { files: [], activeId: null, folderHandle: null, theme: 'dark', mermaidCount: 0 };

  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const fileInput = document.getElementById('fileInput');
  const fileSelect = document.getElementById('fileSelect');
  const pickFolderBtn = document.getElementById('pickFolderBtn');
  const saveBtn = document.getElementById('saveBtn');
  const supported = new Set([
    'md', 'mmd', 'mermaid', 'puml', 'drawio', 'vsdx', 'erd', 'sql', 'mm', 'xmind',
    'c4', 'mpp', 'csv', 'json', 'zen', 'bpmn', 'xml'
  ]);

  const state = { folderHandle: null, selectedCard: null, mermaidCount: 0, theme: 'dark' };
  const state = { folderHandle: null, selectedCard: null, mermaidCount: 0 };

  const fileInput = document.getElementById('fileInput');
  const pickFolderBtn = document.getElementById('pickFolderBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const exportImgBtn = document.getElementById('exportImgBtn');
  const themeBtn = document.getElementById('themeBtn');
  const status = document.getElementById('status');
  const dropzone = document.getElementById('dropzone');

  marked.setOptions({ gfm: true, breaks: true, headerIds: true, mangle: false });
  const folderStatus = document.getElementById('folderStatus');
  const previewGrid = document.getElementById('previewGrid');
  const dropzone = document.getElementById('dropzone');
  const template = document.getElementById('previewTemplate');

  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
  navigator.serviceWorker?.register('sw.js').catch(console.error);

  fileInput.addEventListener('change', async (e) => addFiles([...e.target.files]));
  fileSelect.addEventListener('change', switchActiveFile);
  editor.addEventListener('input', debounce(onEditorInput, 120));
  pickFolderBtn.addEventListener('click', pickFolder);
  saveBtn.addEventListener('click', saveActive);
  clearBtn.addEventListener('click', clearAll);
  exportPdfBtn.addEventListener('click', () => window.print());
  exportImgBtn.addEventListener('click', exportImage);
  themeBtn.addEventListener('click', toggleTheme);

  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
  clearBtn.addEventListener('click', () => {
    previewGrid.innerHTML = '';
    state.selectedCard = null;
  });
  exportPdfBtn.addEventListener('click', () => window.print());
  exportImgBtn.addEventListener('click', exportImage);
  pickFolderBtn.addEventListener('click', pickFolder);
  themeBtn.addEventListener('click', toggleTheme);
  clearBtn.addEventListener('click', () => (previewGrid.innerHTML = ''));
  exportPdfBtn.addEventListener('click', () => window.print());
  exportImgBtn.addEventListener('click', exportImage);
  pickFolderBtn.addEventListener('click', pickFolder);

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    await addFiles([...e.dataTransfer.files]);
  });

  setStatus('Listo para cargar archivos.');

  async function addFiles(files) {
    for (const file of files) {
      const ext = extension(file.name);
      if (!supported.has(ext)) continue;
      const text = await file.text();
      const id = crypto.randomUUID();
      state.files.push({ id, name: file.name, ext, text });
    }
    rebuildSelect();
    if (!state.activeId && state.files.length) {
      state.activeId = state.files[0].id;
      fileSelect.value = state.activeId;
      loadActive();
    }
    setStatus(`${state.files.length} archivo(s) cargado(s).`);
  }

  function extension(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }

  function rebuildSelect() {
    fileSelect.innerHTML = '';
    if (!state.files.length) {
      fileSelect.innerHTML = '<option value="">Sin archivos</option>';
      return;
    }
    state.files.forEach((f) => {
      const option = document.createElement('option');
      option.value = f.id;
      option.textContent = `${f.name} (${f.ext.toUpperCase()})`;
      fileSelect.append(option);
    });
  }

  function switchActiveFile() {
    state.activeId = fileSelect.value;
    loadActive();
  }

  function loadActive() {
    const file = state.files.find((f) => f.id === state.activeId);
    if (!file) return;
    editor.value = file.text;
    render(file.ext, file.text);
  }

  function onEditorInput() {
    const file = state.files.find((f) => f.id === state.activeId);
    if (!file) return;
    file.text = editor.value;
    render(file.ext, file.text);
  }

  async function render(ext, text) {
    if (ext === 'mmd' || ext === 'mermaid') {
      return renderMermaid(text);
    }
    if (ext === 'md') {
      return renderMarkdown(text);
    }
    if (ext === 'csv') {
      preview.innerHTML = csvToTable(text);
      return;
    }
    if (ext === 'json') {
      preview.innerHTML = `<pre><code>${escapeHtml(prettyJson(text))}</code></pre>`;
      return;
    }
    if (['xml', 'bpmn', 'drawio'].includes(ext)) {
      preview.innerHTML = `<pre><code>${escapeHtml(formatXml(text))}</code></pre>`;
      return;
    }
    preview.innerHTML = `<pre><code>${escapeHtml(text)}</code></pre>`;
  }

  async function renderMarkdown(md) {
    const tokens = [];
    const safe = md.replace(/```(mermaid|mmd)\n([\s\S]*?)```/g, (_, __, code) => {
      const token = `__MERMAID_${tokens.length}__`;
      tokens.push({ token, code });
      return token;
    });

    preview.innerHTML = marked.parse(safe);

    for (const tk of tokens) {
      try {
        const id = `merm-${Date.now()}-${state.mermaidCount++}`;
        const { svg } = await mermaid.render(id, tk.code);
        preview.innerHTML = preview.innerHTML.replace(tk.token, `<div class="mermaid-wrap">${svg}</div>`);
      } catch {
        preview.innerHTML = preview.innerHTML.replace(tk.token, `<pre><code>${escapeHtml(tk.code)}</code></pre>`);
      }
    }
  }

  async function renderMermaid(code) {
    try {
      const id = `merm-${Date.now()}-${state.mermaidCount++}`;
      const { svg } = await mermaid.render(id, code);
      preview.innerHTML = `<div class="mermaid-wrap">${svg}</div>`;
    } catch {
      preview.innerHTML = `<pre><code>${escapeHtml(code)}</code></pre>`;
    }
  }

  function csvToTable(csv) {
    const rows = csv.trim().split(/\r?\n/).map((line) => line.split(','));
    if (!rows.length || !rows[0][0]) return '<p><em>CSV vacío</em></p>';
    const [head, ...body] = rows;
    let html = '<table><thead><tr>' + head.map((h) => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>';
    body.forEach((row) => { html += '<tr>' + row.map((v) => `<td>${escapeHtml(v)}</td>`).join('') + '</tr>'; });
    return html + '</tbody></table>';
  }

  function prettyJson(raw) { try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return 'JSON inválido'; } }
  function formatXml(xml) { return xml.replace(/>(\s*)</g, '>\n<'); }
  function escapeHtml(v = '') { return v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    themeBtn.textContent = `Tema: ${state.theme === 'dark' ? 'Dark' : 'Light'}`;
  }

  function clearAll() {
    state.files = [];
    state.activeId = null;
    editor.value = '';
    preview.innerHTML = '';
    rebuildSelect();
    setStatus('Limpio');
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    themeBtn.textContent = `Tema: ${state.theme === 'dark' ? 'Dark' : 'Light'}`;
  }

  async function addFiles(files) {
    for (const file of files) {
      const ext = getExtension(file.name);
  async function addFiles(files) {
    for (const file of files) {
      const ext = extension(file.name);
      if (!supported.has(ext)) continue;
      renderCard({ file, ext, text: await file.text() });
    }
  }

  function getExtension(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }

  function renderCard(item) {
  function extension(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }

  async function renderCard(item) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.card');
    const raw = node.querySelector('.raw');
    const rendered = node.querySelector('.rendered');

    node.querySelector('.filename').textContent = item.file.name;
    node.querySelector('.meta').textContent = `${item.ext.toUpperCase()} • ${Math.max(1, Math.round(item.file.size / 1024))} KB`;
    raw.value = item.text;

    card.addEventListener('click', () => (state.selectedCard = card));
    raw.addEventListener('input', () => renderByType(item.ext, raw.value, rendered));

    raw.textContent = item.text;

    card.addEventListener('click', () => (state.selectedCard = card));
    previewGrid.prepend(node);
    const cardRef = previewGrid.firstElementChild;
    if (!state.selectedCard) state.selectedCard = cardRef;

    renderByType(item.ext, item.text, rendered);
  }

  async function renderByType(ext, text, container) {
    if (ext === 'md') return renderMarkdown(text, container);
    if (ext === 'mmd' || ext === 'mermaid') return renderMermaid(text, container);
    if (ext === 'csv') return void (container.innerHTML = csvToTable(text));
    if (ext === 'json') return void (container.innerHTML = `<pre>${escapeHtml(prettyJson(text))}</pre>`);
    if (['xml', 'bpmn', 'drawio'].includes(ext)) return void (container.innerHTML = `<pre>${escapeHtml(formatXml(text))}</pre>`);
    await renderByType(item.ext, item.text, rendered);
  }

  async function renderByType(ext, text, container) {
    if (ext === 'md') {
      await renderMarkdown(text, container);
      return;
    }
    if (ext === 'mmd' || ext === 'mermaid') {
      await renderMermaid(text, container);
      return;
    }
    if (ext === 'csv') {
      container.innerHTML = csvToTable(text);
      return;
    }
    if (ext === 'json') {
      container.innerHTML = `<pre>${escapeHtml(prettyJson(text))}</pre>`;
      return;
    }
    if (['xml', 'bpmn', 'drawio'].includes(ext)) {
      container.innerHTML = `<pre>${escapeHtml(formatXml(text))}</pre>`;
      return;
    }

    container.innerHTML = `<h3>Preview textual</h3><pre>${escapeHtml(text)}</pre>`;
  }

  async function renderMarkdown(md, container) {
    const { html, mermaidBlocks } = markdownToHtml(md);
    container.innerHTML = html;
    for (const block of mermaidBlocks) {
      try {
        const id = `merm-${Date.now()}-${state.mermaidCount++}`;
        const { svg } = await mermaid.render(id, block.code);
        container.innerHTML = container.innerHTML.replace(block.token, `<div class="mermaid">${svg}</div>`);
      } catch {
        container.innerHTML = container.innerHTML.replace(block.token, `<pre>${escapeHtml(block.code)}</pre>`);
      }
    const mermaidBlocks = [];
    let idx = 0;
    const html = escapeHtml(md)
      .replace(/```(mermaid|mmd)\n([\s\S]*?)```/g, (_, __, code) => {
        const token = `__MERMAID_${idx++}__`;
        mermaidBlocks.push({ token, code });
        return token;
      })
      .replace(/^### (.*)$/gm, '<h3>$1</h3>')
      .replace(/^## (.*)$/gm, '<h2>$1</h2>')
      .replace(/^# (.*)$/gm, '<h1>$1</h1>')
      .replace(/^- (.*)$/gm, '<li>$1</li>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');

    container.innerHTML = html;
    for (const block of mermaidBlocks) {
      const id = `merm-${Date.now()}-${state.mermaidCount++}`;
      const { svg } = await mermaid.render(id, block.code);
      container.innerHTML = container.innerHTML.replace(block.token, `<div class="mermaid">${svg}</div>`);
    }
  }

  async function renderMermaid(code, container) {
    try {
      const id = `merm-${Date.now()}-${state.mermaidCount++}`;
      const { svg } = await mermaid.render(id, code);
      container.innerHTML = `<div class="mermaid">${svg}</div>`;
    } catch {
      container.innerHTML = `<h3>Error Mermaid</h3><pre>${escapeHtml(code)}</pre>`;
    }
  }

  function markdownToHtml(md) {
    const mermaidBlocks = [];
    const lines = md.replace(/\r/g, '').split('\n');
    const out = [];
    let i = 0;
    let inCode = false;
    let codeLang = '';
    let codeBuffer = [];

    while (i < lines.length) {
      const line = lines[i];

      const fence = line.match(/^```\s*(\w+)?\s*$/);
      if (fence) {
        if (!inCode) {
          inCode = true;
          codeLang = (fence[1] || '').toLowerCase();
          codeBuffer = [];
        } else {
          if (codeLang === 'mermaid' || codeLang === 'mmd') {
            const token = `__MERMAID_${mermaidBlocks.length}__`;
            mermaidBlocks.push({ token, code: codeBuffer.join('\n') });
            out.push(token);
          } else {
            out.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
          }
          inCode = false;
          codeLang = '';
          codeBuffer = [];
        }
        i++;
        continue;
      }

      if (inCode) {
        codeBuffer.push(line);
        i++;
        continue;
      }

      if (/^\s*$/.test(line)) {
        out.push('');
        i++;
        continue;
      }

      if (/^\|.+\|$/.test(line) && i + 1 < lines.length && /^\|[\s:-|]+\|$/.test(lines[i + 1])) {
        const headers = splitPipeRow(line);
        i += 2;
        const body = [];
        while (i < lines.length && /^\|.+\|$/.test(lines[i])) {
          body.push(splitPipeRow(lines[i]));
          i++;
        }
        let table = '<table><thead><tr>' + headers.map((h) => `<th>${inlineMd(h)}</th>`).join('') + '</tr></thead><tbody>';
        body.forEach((row) => {
          table += '<tr>' + headers.map((_, idx) => `<td>${inlineMd(row[idx] || '')}</td>`).join('') + '</tr>';
        });
        table += '</tbody></table>';
        out.push(table);
        continue;
      }

      if (/^---+$/.test(line.trim())) { out.push('<hr/>'); i++; continue; }
      const h = line.match(/^(#{1,3})\s+(.*)$/);
      if (h) { out.push(`<h${h[1].length}>${inlineMd(h[2])}</h${h[1].length}>`); i++; continue; }

      const ul = line.match(/^\s*[-*]\s+(.*)$/);
      if (ul) {
        const items = [ul[1]];
        i++;
        while (i < lines.length) {
          const m = lines[i].match(/^\s*[-*]\s+(.*)$/);
          if (!m) break;
          items.push(m[1]);
          i++;
        }
        out.push('<ul>' + items.map((it) => `<li>${inlineMd(it)}</li>`).join('') + '</ul>');
        continue;
      }

      const ol = line.match(/^\s*\d+\.\s+(.*)$/);
      if (ol) {
        const items = [ol[1]];
        i++;
        while (i < lines.length) {
          const m = lines[i].match(/^\s*\d+\.\s+(.*)$/);
          if (!m) break;
          items.push(m[1]);
          i++;
        }
        out.push('<ol>' + items.map((it) => `<li>${inlineMd(it)}</li>`).join('') + '</ol>');
        continue;
      }

      out.push(`<p>${inlineMd(line)}</p>`);
      i++;
    }

    return { html: out.join('\n'), mermaidBlocks };
  }

  function splitPipeRow(row) {
    return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  }

  function inlineMd(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  }

  function csvToTable(csv) {
    const rows = csv.trim().split(/\r?\n/).map((line) => line.split(','));
    if (!rows.length || (rows.length === 1 && rows[0][0] === '')) return '<em>CSV vacío</em>';
  function csvToTable(csv) {
    const rows = csv.trim().split(/\r?\n/).map((line) => line.split(','));
    if (!rows.length) return '<em>CSV vacío</em>';
    const [head, ...body] = rows;
    let out = '<table><thead><tr>' + head.map((h) => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>';
    body.forEach((r) => { out += '<tr>' + r.map((v) => `<td>${escapeHtml(v)}</td>`).join('') + '</tr>'; });
    return out + '</tbody></table>';
  }

  function prettyJson(raw) {
    try { return JSON.stringify(JSON.parse(raw), null, 2); }
    catch { return 'JSON inválido'; }
  }

  function formatXml(xml) { return xml.replace(/>(\s*)</g, '>\n<'); }

  function escapeHtml(value = '') {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  async function pickFolder() {
    if (!window.showDirectoryPicker) {
      setStatus('File System Access API no compatible.');
      return;
    }
    state.folderHandle = await window.showDirectoryPicker();
    setStatus(`Carpeta: ${state.folderHandle.name}`);
  }

  async function saveActive() {
    const file = state.files.find((f) => f.id === state.activeId);
    if (!file) return;
    if (state.folderHandle) {
      const handle = await state.folderHandle.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file.text);
      await writable.close();
      setStatus(`Guardado en ${state.folderHandle.name}/${file.name}`);
      return;
    }
    const blob = new Blob([file.text], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setStatus(`Descargado: ${file.name}`);
  }

  async function exportImage() {
      folderStatus.textContent = 'Carpeta: API no compatible en este navegador.';
      return;
    }
    state.folderHandle = await window.showDirectoryPicker();
    folderStatus.textContent = `Carpeta: ${state.folderHandle.name}`;
  }

  async function exportImage() {
    const card = state.selectedCard || previewGrid.querySelector('.card');
    if (!card) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b1a35';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#eabf65';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('Vizualizador Offline - Editor', 36, 55);
    ctx.fillStyle = '#eaf1ff';
    ctx.font = '15px monospace';
    editor.value.split('\n').slice(0, 48).forEach((l, i) => ctx.fillText(l.slice(0, 150), 36, 100 + i * 18));
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    ctx.fillStyle = '#e5ba58';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(card.querySelector('.filename').textContent, 36, 52);
    ctx.fillStyle = '#ecf2ff';
    ctx.font = '16px monospace';
    const lines = card.querySelector('.raw').value.split('\n');
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(card.querySelector('.filename').textContent, 36, 52);
    ctx.fillStyle = '#e5ecff';
    ctx.font = '16px monospace';
    const lines = card.querySelector('.raw').textContent.split('\n');
    lines.slice(0, 45).forEach((line, i) => ctx.fillText(line.slice(0, 150), 36, 92 + i * 20));

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (state.folderHandle) {
      const name = `${Date.now()}-preview.png`;
      const handle = await state.folderHandle.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      folderStatus.textContent = `PNG guardado en ${state.folderHandle.name}/${name}`;
      return;
    }

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'preview.png';
    a.click();
  }

  function setStatus(text) { status.textContent = text; }
  function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
})();
