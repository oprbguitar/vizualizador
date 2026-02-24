(() => {
  const supported = new Set([
    'md', 'mmd', 'mermaid', 'puml', 'drawio', 'vsdx', 'erd', 'sql', 'mm', 'xmind',
    'c4', 'mpp', 'csv', 'json', 'zen', 'bpmn', 'xml'
  ]);

  const state = { folderHandle: null, selectedCard: null, mermaidCount: 0, theme: 'dark' };

  const fileInput = document.getElementById('fileInput');
  const pickFolderBtn = document.getElementById('pickFolderBtn');
  const clearBtn = document.getElementById('clearBtn');
  const exportPdfBtn = document.getElementById('exportPdfBtn');
  const exportImgBtn = document.getElementById('exportImgBtn');
  const themeBtn = document.getElementById('themeBtn');
  const folderStatus = document.getElementById('folderStatus');
  const previewGrid = document.getElementById('previewGrid');
  const dropzone = document.getElementById('dropzone');
  const template = document.getElementById('previewTemplate');

  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'default' });
  navigator.serviceWorker?.register('sw.js').catch(console.error);

  fileInput.addEventListener('change', async (e) => addFiles([...e.target.files]));
  clearBtn.addEventListener('click', () => {
    previewGrid.innerHTML = '';
    state.selectedCard = null;
  });
  exportPdfBtn.addEventListener('click', () => window.print());
  exportImgBtn.addEventListener('click', exportImage);
  pickFolderBtn.addEventListener('click', pickFolder);
  themeBtn.addEventListener('click', toggleTheme);

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

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    themeBtn.textContent = `Tema: ${state.theme === 'dark' ? 'Dark' : 'Light'}`;
  }

  async function addFiles(files) {
    for (const file of files) {
      const ext = getExtension(file.name);
      if (!supported.has(ext)) continue;
      renderCard({ file, ext, text: await file.text() });
    }
  }

  function getExtension(name) { return name.includes('.') ? name.split('.').pop().toLowerCase() : ''; }

  function renderCard(item) {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.card');
    const raw = node.querySelector('.raw');
    const rendered = node.querySelector('.rendered');

    node.querySelector('.filename').textContent = item.file.name;
    node.querySelector('.meta').textContent = `${item.ext.toUpperCase()} • ${Math.max(1, Math.round(item.file.size / 1024))} KB`;
    raw.value = item.text;

    card.addEventListener('click', () => (state.selectedCard = card));
    raw.addEventListener('input', () => renderByType(item.ext, raw.value, rendered));

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
    ctx.fillStyle = '#0b1a35';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e5ba58';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(card.querySelector('.filename').textContent, 36, 52);
    ctx.fillStyle = '#ecf2ff';
    ctx.font = '16px monospace';
    const lines = card.querySelector('.raw').value.split('\n');
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
