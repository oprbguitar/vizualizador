/* ==========================================================================
   V3 · Estudio — la nueva versión.
   Mantiene la lógica de la V2 (editor a la izquierda, preview a la derecha)
   y añade: pestañas por archivo, numeración de líneas, estadísticas en vivo,
   scroll sincronizado, splitter, zoom y vistas ricas para JSON y XML.
   ========================================================================== */

(() => {
  'use strict';
  const { store, util } = window.Vizu;

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
| Datos | \`.csv\` \`.json\` | Tabla / árbol plegable |
| XML | \`.xml\` \`.bpmn\` \`.drawio\` | Formateado y coloreado |

> Las tres versiones comparten los mismos archivos: cambia arriba de V1 a V3
> y verás el mismo documento con otra forma de visualizarlo.
`;

  const raiz = document.getElementById('vista-v3');
  const editor = document.getElementById('v3-editor');
  const gutter = document.getElementById('v3-gutter');
  const preview = document.getElementById('v3-preview');
  const pestañas = document.getElementById('v3-tabs');
  const estado = document.getElementById('v3-status');
  const insignia = document.getElementById('v3-fileBadge');
  const cursor = document.getElementById('v3-cursorInfo');
  const tiempo = document.getElementById('v3-renderTime');
  const sync = document.getElementById('v3-syncScroll');
  const splitter = document.getElementById('v3-splitter');
  const zoomEtiqueta = document.getElementById('v3-zoomResetBtn');

  const stats = {
    chars: document.getElementById('v3-statChars'),
    words: document.getElementById('v3-statWords'),
    lines: document.getElementById('v3-statLines'),
    headings: document.getElementById('v3-statHeadings'),
    tables: document.getElementById('v3-statTables'),
    diagrams: document.getElementById('v3-statDiagrams'),
    read: document.getElementById('v3-statRead'),
    folder: document.getElementById('v3-statFolder')
  };

  let iniciada = false;
  let zoom = 1;
  let secuencia = 0;

  function iniciar() {
    if (iniciada) return;
    iniciada = true;

    document.getElementById('v3-fileInput').addEventListener('change', async (e) => {
      await store.agregarArchivos([...e.target.files]);
      e.target.value = '';
    });

    editor.addEventListener('input', () => {
      const archivo = store.activo();
      if (archivo) store.actualizar(archivo.id, editor.value);
      pintarGutter();
      programarRender();
    });
    editor.addEventListener('keyup', pintarCursor);
    editor.addEventListener('click', pintarCursor);
    editor.addEventListener('scroll', () => {
      gutter.scrollTop = editor.scrollTop;
      sincronizarScroll();
    });
    editor.addEventListener('keydown', tabulador);

    document.getElementById('v3-newBtn').addEventListener('click', () => {
      store.abrir(`sin-titulo-${store.archivos.length + 1}.md`, '# Nuevo documento\n\n');
      editor.focus();
    });
    document.getElementById('v3-demoBtn').addEventListener('click', () => store.abrir('bienvenida.md', DEMO));
    document.getElementById('v3-saveBtn').addEventListener('click', guardarActivo);
    document.getElementById('v3-clearBtn').addEventListener('click', () => store.limpiar());
    document.getElementById('v3-exportPdfBtn').addEventListener('click', () => window.print());
    document.getElementById('v3-exportImgBtn').addEventListener('click', exportarImagen);
    document.getElementById('v3-pickFolderBtn').addEventListener('click', async () => {
      await util.elegirCarpeta();
      pintarCarpeta();
    });

    document.getElementById('v3-zoomInBtn').addEventListener('click', () => fijarZoom(zoom + 0.1));
    document.getElementById('v3-zoomOutBtn').addEventListener('click', () => fijarZoom(zoom - 0.1));
    zoomEtiqueta.addEventListener('click', () => fijarZoom(1));

    splitter.addEventListener('pointerdown', arrastrarSplitter);
    splitter.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') moverSplit(-0.04);
      if (e.key === 'ArrowRight') moverSplit(0.04);
    });

    fijarSplit(0.5);
  }

  function refrescar() {
    pintarPestañas();
    pintarCarpeta();
    const archivo = store.activo();

    if (!archivo) {
      editor.value = '';
      insignia.textContent = '—';
      pintarGutter();
      vacio();
      actualizarEstadisticas('');
      return;
    }
    if (editor.value !== archivo.texto) editor.value = archivo.texto;
    insignia.textContent = util.etiqueta(archivo.ext);
    pintarGutter();
    pintarCursor();
    renderAhora();
  }

  /* ------------------------------------------------------------- pestañas */

  function pintarPestañas() {
    pestañas.innerHTML = '';
    store.archivos.forEach((archivo) => {
      const pestaña = document.createElement('div');
      pestaña.className = `tab${archivo.id === store.activoId ? ' active' : ''}`;
      pestaña.title = `${archivo.nombre} · ${util.etiqueta(archivo.ext)}`;

      const nombre = document.createElement('span');
      nombre.className = 'tab-name';
      nombre.textContent = archivo.nombre;

      const cerrar = document.createElement('button');
      cerrar.className = 'tab-close';
      cerrar.type = 'button';
      cerrar.textContent = '×';
      cerrar.title = 'Cerrar';
      cerrar.addEventListener('click', (e) => {
        e.stopPropagation();
        store.cerrar(archivo.id);
      });

      pestaña.append(nombre, cerrar);
      pestaña.addEventListener('click', () => store.activar(archivo.id));
      pestañas.append(pestaña);
    });
  }

  /* --------------------------------------------------------------- render */

  const programarRender = util.debounce(() => renderAhora(), 120);

  async function renderAhora() {
    const archivo = store.activo();
    const texto = editor.value;
    actualizarEstadisticas(texto);

    if (!archivo && !texto.trim()) return vacio();

    const propia = ++secuencia;
    const inicio = performance.now();
    util.ocupado(true);

    const capa = document.createElement('div');
    capa.className = 'zoom-layer';
    capa.style.zoom = zoom;
    const ext = archivo ? archivo.ext : 'md';

    try {
      if (ext === 'md' || ext === 'markdown') await util.markdownEnHtml(texto, capa);
      else if (ext === 'mmd' || ext === 'mermaid') capa.append(await util.nodoMermaid(texto));
      else if (ext === 'csv' || ext === 'tsv') renderCsv(texto, capa, ext);
      else if (ext === 'json') renderJson(texto, capa);
      else if (['xml', 'bpmn', 'drawio'].includes(ext)) renderXml(texto, capa);
      else renderTexto(texto, capa, ext);
    } catch (error) {
      capa.innerHTML = `<div class="mermaid-error"><strong>Error de render</strong><pre>${util.escapeHtml(error.message || error)}</pre></div>`;
    }

    if (propia !== secuencia) return; // llegó un render más reciente

    preview.replaceChildren(capa);
    preview.classList.remove('fade-in');
    void preview.offsetWidth;
    preview.classList.add('fade-in');

    tiempo.textContent = `${Math.round(performance.now() - inicio)} ms`;
    util.ocupado(false);
  }

  function vacio() {
    preview.replaceChildren();
    const caja = document.createElement('div');
    caja.className = 'empty-state';
    caja.innerHTML = `
      <div class="big">🗺️</div>
      <strong>Nada que mostrar todavía</strong>
      <span>Pulsa <b>Nuevo</b>, abre un archivo o arrastra uno sobre la ventana.</span>
      <span>¿Quieres ver de qué es capaz? Pulsa <b>Demo</b>.</span>`;
    preview.append(caja);
    tiempo.textContent = '0 ms';
  }

  function renderCsv(bruto, contenedor, ext) {
    const delimitador = ext === 'tsv' ? '\t' : util.detectarDelimitador(bruto);
    const filas = util.parsearDelimitado(bruto, delimitador);
    if (!filas.length) {
      contenedor.innerHTML = '<p class="muted">Archivo de datos vacío.</p>';
      return;
    }
    const nombres = { ',': 'coma', ';': 'punto y coma', '\t': 'tabulador', '|': 'barra' };
    contenedor.append(
      cabeceraVisor([`${filas.length - 1} filas`, `${filas[0].length} columnas`, `delimitador: ${nombres[delimitador] || delimitador}`])
    );
    const tabla = document.createElement('div');
    tabla.innerHTML = util.csvATabla(bruto, delimitador);
    contenedor.append(tabla.firstElementChild);
  }

  function renderJson(bruto, contenedor) {
    let datos;
    try {
      datos = JSON.parse(bruto);
    } catch (error) {
      contenedor.innerHTML = `<div class="mermaid-error"><strong>JSON inválido</strong><pre>${util.escapeHtml(error.message)}</pre></div>`;
      return;
    }
    const arbol = document.createElement('div');
    arbol.className = 'json-tree';
    arbol.innerHTML = jsonEnHtml(datos, null, 0);
    contenedor.append(
      cabeceraVisor([`${contarNodos(datos)} nodos`, `tipo raíz: ${Array.isArray(datos) ? 'array' : typeof datos}`]),
      arbol
    );
  }

  function jsonEnHtml(valor, clave, nivel) {
    const etiqueta = clave === null ? '' : `<span class="json-key">"${util.escapeHtml(clave)}"</span>: `;
    if (valor === null) return `<div class="json-row">${etiqueta}<span class="json-null">null</span></div>`;
    if (Array.isArray(valor)) {
      const hijos = valor.map((item, i) => jsonEnHtml(item, String(i), nivel + 1)).join('');
      return `<details ${nivel < 2 ? 'open' : ''}><summary>${etiqueta}[ ] <span class="json-count">${valor.length} elementos</span></summary>${hijos}</details>`;
    }
    if (typeof valor === 'object') {
      const claves = Object.keys(valor);
      const hijos = claves.map((k) => jsonEnHtml(valor[k], k, nivel + 1)).join('');
      return `<details ${nivel < 2 ? 'open' : ''}><summary>${etiqueta}{ } <span class="json-count">${claves.length} claves</span></summary>${hijos}</details>`;
    }
    const clase = typeof valor === 'string' ? 'json-string' : typeof valor === 'number' ? 'json-number' : 'json-boolean';
    const mostrado = typeof valor === 'string' ? `"${valor}"` : String(valor);
    return `<div class="json-row">${etiqueta}<span class="${clase}">${util.escapeHtml(mostrado)}</span></div>`;
  }

  function contarNodos(valor) {
    if (valor === null || typeof valor !== 'object') return 1;
    return Object.values(valor).reduce((total, item) => total + contarNodos(item), 1);
  }

  function renderXml(bruto, contenedor) {
    const bonito = util.formatearXml(bruto);
    const etiquetas = (bruto.match(/<[a-zA-Z_][^\s/>]*/g) || []).length;
    const pre = document.createElement('pre');
    pre.innerHTML = `<code class="code-lines">${bonito
      .split('\n')
      .map((linea) => `<span class="cl">${colorearXml(linea)}</span>`)
      .join('')}</code>`;
    contenedor.append(cabeceraVisor([`${etiquetas} etiquetas`, `${bonito.split('\n').length} líneas formateadas`]), pre);
  }

  function colorearXml(linea) {
    return util
      .escapeHtml(linea)
      .replace(/&lt;(\/?[\w:.-]+)/g, '&lt;<span class="xml-tag">$1</span>')
      .replace(/([\w:.-]+)=(&quot;.*?&quot;)/g, '<span class="xml-attr">$1</span>=<span class="xml-val">$2</span>');
  }

  function renderTexto(texto, contenedor, ext) {
    const pre = document.createElement('pre');
    pre.innerHTML = `<code class="code-lines">${texto
      .split('\n')
      .map((linea) => `<span class="cl">${util.escapeHtml(linea) || ' '}</span>`)
      .join('')}</code>`;
    contenedor.append(
      cabeceraVisor([util.etiqueta(ext), `${texto.split('\n').length} líneas`, 'vista textual'], 'Sin renderer gráfico para este formato'),
      pre
    );
  }

  function cabeceraVisor(chips, nota) {
    const cabecera = document.createElement('div');
    cabecera.className = 'viewer-head';
    cabecera.innerHTML =
      chips.map((chip, i) => `<span class="chip${i === 0 ? ' chip-accent' : ''}">${util.escapeHtml(chip)}</span>`).join('') +
      (nota ? `<span class="chip">${util.escapeHtml(nota)}</span>` : '');
    return cabecera;
  }

  /* --------------------------------------------------------- editor y UI */

  function pintarGutter() {
    const total = editor.value.split('\n').length;
    const filas = [];
    for (let i = 1; i <= total; i += 1) filas.push(i);
    gutter.textContent = filas.join('\n');
    gutter.scrollTop = editor.scrollTop;
  }

  function pintarCursor() {
    const hasta = editor.value.slice(0, editor.selectionStart);
    const lineas = hasta.split('\n');
    cursor.textContent = `Ln ${lineas.length}, Col ${lineas[lineas.length - 1].length + 1}`;
  }

  function tabulador(e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    editor.setRangeText('  ', editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input'));
  }

  function sincronizarScroll() {
    if (!sync.checked) return;
    const maximo = editor.scrollHeight - editor.clientHeight;
    if (maximo <= 0) return;
    preview.scrollTop = (editor.scrollTop / maximo) * (preview.scrollHeight - preview.clientHeight);
  }

  function actualizarEstadisticas(texto) {
    const palabras = texto ? (texto.trim().match(/\S+/g) || []).length : 0;
    fijarEstadistica('chars', texto.length);
    fijarEstadistica('words', palabras);
    fijarEstadistica('lines', texto ? texto.split('\n').length : 0);
    fijarEstadistica('headings', (texto.match(/^#{1,6}\s+\S/gm) || []).length);
    fijarEstadistica('tables', (texto.match(/^\s*\|[\s:|-]+\|\s*$/gm) || []).length);
    fijarEstadistica('diagrams', (texto.match(/```(mermaid|mmd)/g) || []).length);
    fijarEstadistica('read', Math.max(palabras ? 1 : 0, Math.round(palabras / 200)));
  }

  function fijarEstadistica(clave, valor) {
    const nodo = stats[clave];
    if (!nodo || nodo.textContent === String(valor)) return;
    nodo.textContent = valor;
    const padre = nodo.closest('.stat');
    padre.classList.remove('bump');
    void padre.offsetWidth;
    padre.classList.add('bump');
  }

  function pintarCarpeta() {
    stats.folder.textContent = store.carpeta ? `Carpeta: ${store.carpeta.name}` : 'Carpeta: sin seleccionar';
  }

  function fijarZoom(valor) {
    zoom = Math.min(2.5, Math.max(0.5, Math.round(valor * 10) / 10));
    zoomEtiqueta.textContent = `${Math.round(zoom * 100)}%`;
    const capa = preview.querySelector('.zoom-layer');
    if (capa) capa.style.zoom = zoom;
  }

  function fijarSplit(fraccion) {
    const acotada = Math.min(0.8, Math.max(0.2, fraccion));
    document.documentElement.style.setProperty('--split', acotada);
    document.documentElement.style.setProperty('--editor-fraction', `${acotada}fr`);
  }

  function moverSplit(delta) {
    const actual = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--split') || '0.5');
    fijarSplit(actual + delta);
  }

  function arrastrarSplitter(e) {
    if (window.innerWidth <= 980) return;
    e.preventDefault();
    splitter.classList.add('dragging');
    splitter.setPointerCapture(e.pointerId);

    const area = document.getElementById('v3-workspace');
    const mover = (ev) => {
      const caja = area.getBoundingClientRect();
      fijarSplit((ev.clientX - caja.left) / caja.width);
    };
    const parar = () => {
      splitter.classList.remove('dragging');
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', parar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', parar);
  }

  /* ---------------------------------------------------------- exportación */

  async function guardarActivo() {
    const archivo = store.activo();
    if (!archivo) return util.aviso('No hay archivo activo', 'err');
    store.actualizar(archivo.id, editor.value);
    await util.guardar(archivo.nombre, editor.value);
    estado.textContent = `Guardado: ${archivo.nombre}`;
  }

  async function exportarImagen() {
    util.ocupado(true);
    try {
      const svg = preview.querySelector('.mermaid-wrap svg');
      const nombre = (store.activo()?.nombre || 'preview').replace(/\.[^.]+$/, '');
      const blob = svg
        ? await util.svgAPng(svg)
        : await util.textoAPng(nombre, editor.value, document.documentElement.dataset.theme);
      await util.guardar(`${nombre}.png`, blob, 'image/png');
    } catch (error) {
      util.aviso(`No se pudo exportar PNG: ${error.message}`, 'err');
    } finally {
      util.ocupado(false);
    }
  }

  window.Vizu.registrar({
    id: 'v3',
    nombre: 'V3 · Estudio',
    descripcion: 'La versión nueva: pestañas por archivo, estadísticas en vivo, zoom, scroll sincronizado y vistas ricas para JSON y XML.',
    raiz,
    iniciar,
    refrescar,
    demo: DEMO,
    estado
  });
})();
