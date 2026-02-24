(() => {
  const supported = new Set(['md', 'mmd', 'mermaid', 'puml', 'drawio', 'vsdx', 'erd', 'sql', 'mm', 'xmind', 'c4', 'mpp', 'csv', 'json', 'zen', 'bpmn', 'xml']);
  const state = { files: [], activeId: null, folderHandle: null, theme: 'dark', mermaidCount: 0 };

  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const fileInput = document.getElementById('fileInput');
  const fileSelect = document.getElementById('fileSelect');
  const pickFolderBtn = document.getElementById('pickFolderBtn');
  const saveBtn = document.getElementById('saveBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const exportImgBtn = document.getElementById('exportImgBtn');
  const themeBtn = document.getElementById('themeBtn');
  const status = document.getElementById('status');
  const dropzone = document.getElementById('dropzone');

  marked.setOptions({ gfm: true, breaks: true, headerIds: true, mangle: false });
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'preview.png';
    a.click();
  }

  function setStatus(text) { status.textContent = text; }
  function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
})();
