const supported = new Set([
  'md', 'mmd', 'mermaid', 'puml', 'drawio', 'vsdx', 'erd', 'sql', 'mm', 'xmind',
  'c4', 'mpp', 'csv', 'json', 'zen', 'bpmn', 'xml'
]);

const state = {
  files: [],
  folderHandle: null,
  selectedCard: null
};

const fileInput = document.getElementById('fileInput');
const pickFolderBtn = document.getElementById('pickFolderBtn');
const clearBtn = document.getElementById('clearBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const exportImgBtn = document.getElementById('exportImgBtn');
const folderStatus = document.getElementById('folderStatus');
const previewGrid = document.getElementById('previewGrid');
const dropzone = document.getElementById('dropzone');
const template = document.getElementById('previewTemplate');

fileInput.addEventListener('change', async (e) => addFiles([...e.target.files]));
clearBtn.addEventListener('click', () => {
  state.files = [];
  previewGrid.innerHTML = '';
});
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

navigator.serviceWorker?.register('sw.js').catch(console.error);

async function addFiles(fileList) {
  for (const file of fileList) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!supported.has(ext)) continue;
    const text = await readFile(file, ext);
    const item = { file, ext, text };
    state.files.push(item);
    renderCard(item);
  }
}

function readFile(file, ext) {
  if (['png', 'jpg', 'jpeg', 'gif'].includes(ext)) return file.arrayBuffer();
  return file.text();
}

function renderCard(item) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.card');
  card.addEventListener('click', () => (state.selectedCard = card));

  node.querySelector('.filename').textContent = item.file.name;
  node.querySelector('.meta').textContent = `${item.ext.toUpperCase()} • ${Math.round(item.file.size / 1024)} KB`;
  node.querySelector('.raw').textContent = typeof item.text === 'string' ? item.text : '[binario]';

  const rendered = node.querySelector('.rendered');
  renderByType(item, rendered);
  previewGrid.prepend(node);
  if (!state.selectedCard) state.selectedCard = previewGrid.querySelector('.card');
}

function renderByType(item, container) {
  const { ext, text } = item;
  if (ext === 'md') {
    container.innerHTML = markdownToHtml(text);
    return;
  }
  if (ext === 'csv') {
    renderCsv(text, container);
    return;
  }
  if (ext === 'json') {
    renderJson(text, container);
    return;
  }
  if (['xml', 'bpmn', 'drawio'].includes(ext)) {
    container.innerHTML = `<pre>${escapeHtml(formatXml(text))}</pre>`;
    return;
  }
  if (['mmd', 'mermaid', 'puml', 'c4', 'erd', 'sql', 'zen', 'mpp', 'vsdx', 'mm', 'xmind'].includes(ext)) {
    container.innerHTML = `<h3>Preview textual</h3><pre>${escapeHtml(text)}</pre>`;
    return;
  }
  container.textContent = 'Formato cargado, sin renderer específico.';
}

function markdownToHtml(md) {
  return md
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br />');
}

function renderCsv(csv, container) {
  const rows = csv.trim().split(/\r?\n/).map((r) => r.split(','));
  if (!rows.length) return;
  const [head, ...body] = rows;
  let html = '<table><thead><tr>' + head.map((h) => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead><tbody>';
  body.forEach((r) => {
    html += '<tr>' + r.map((c) => `<td>${escapeHtml(c)}</td>`).join('') + '</tr>';
  });
  html += '</tbody></table>';
  container.innerHTML = html;
}

function renderJson(raw, container) {
  try {
    const data = JSON.parse(raw);
    container.innerHTML = `<pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>`;
  } catch {
    container.textContent = 'JSON inválido.';
  }
}

function formatXml(xml) {
  return xml.replace(/>(\s*)</g, '><').replace(/></g, '>\n<');
}

function escapeHtml(value = '') {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
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
  const text = card.querySelector('.raw').textContent.slice(0, 7000);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#22d3ee';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(card.querySelector('.filename').textContent, 36, 56);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '18px monospace';

  const lines = text.split('\n');
  lines.slice(0, 38).forEach((line, idx) => {
    ctx.fillText(line.slice(0, 140), 36, 100 + idx * 20);
  });

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (state.folderHandle) {
    const name = `${Date.now()}-preview.png`;
    const fileHandle = await state.folderHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    folderStatus.textContent = `PNG guardado en ${state.folderHandle.name}/${name}`;
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'preview.png';
    a.click();
  }
}
