(() => {
  const supported = new Set([
    'md', 'mmd', 'mermaid', 'puml', 'drawio', 'vsdx', 'erd', 'sql', 'mm', 'xmind',
    'c4', 'mpp', 'csv', 'json', 'zen', 'bpmn', 'xml'
  ]);

  const state = { folderHandle: null, selectedCard: null, mermaidCount: 0 };

  const fileInput = document.getElementById('fileInput');
  const pickFolderBtn = document.getElementById('pickFolderBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const exportImgBtn = document.getElementById('exportImgBtn');
  const folderStatus = document.getElementById('folderStatus');
  const previewGrid = document.getElementById('previewGrid');
  const dropzone = document.getElementById('dropzone');
  const template = document.getElementById('previewTemplate');

  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
  navigator.serviceWorker?.register('sw.js').catch(console.error);

  fileInput.addEventListener('change', async (e) => addFiles([...e.target.files]));
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

  async function addFiles(files) {
    for (const file of files) {
      const ext = extension(file.name);
      if (!supported.has(ext)) continue;
      renderCard({ file, ext, text: await file.text() });
    }
  }

  function extension(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }

  async function renderCard(item) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.card');
    const raw = node.querySelector('.raw');
    const rendered = node.querySelector('.rendered');

    node.querySelector('.filename').textContent = item.file.name;
    node.querySelector('.meta').textContent = `${item.ext.toUpperCase()} • ${Math.max(1, Math.round(item.file.size / 1024))} KB`;
    raw.textContent = item.text;

    card.addEventListener('click', () => (state.selectedCard = card));
    previewGrid.prepend(node);
    const cardRef = previewGrid.firstElementChild;
    if (!state.selectedCard) state.selectedCard = cardRef;

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
})();
