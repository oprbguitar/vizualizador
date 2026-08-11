/* ==========================================================================
   V2 · Editor en vivo — la segunda forma de visualizar del repositorio.
   Dos paneles fijos: editor a la izquierda, preview a la derecha, con un
   selector para el archivo activo. Misma lógica de siempre, ahora sobre el
   almacén compartido.
   ========================================================================== */

(() => {
  'use strict';
  const { store, util } = window.Vizu;

  const raiz = document.getElementById('vista-v2');
  const editor = document.getElementById('v2-editor');
  const preview = document.getElementById('v2-preview');
  const selector = document.getElementById('v2-fileSelect');
  const entrada = document.getElementById('v2-fileInput');
  const zona = document.getElementById('v2-dropzone');
  const estado = document.getElementById('v2-status');

  let iniciada = false;

  function iniciar() {
    if (iniciada) return;
    iniciada = true;

    entrada.addEventListener('change', async (e) => {
      await store.agregarArchivos([...e.target.files]);
      e.target.value = '';
    });

    selector.addEventListener('change', () => store.activar(selector.value));
    editor.addEventListener('input', util.debounce(alEscribir, 120));

    document.getElementById('v2-saveBtn').addEventListener('click', guardarActivo);
    document.getElementById('v2-clearBtn').addEventListener('click', () => store.limpiar());
    document.getElementById('v2-exportPdfBtn').addEventListener('click', () => window.print());
    document.getElementById('v2-exportImgBtn').addEventListener('click', exportarImagen);
    document.getElementById('v2-pickFolderBtn').addEventListener('click', async () => {
      const carpeta = await util.elegirCarpeta();
      if (carpeta) fijarEstado(`Carpeta: ${carpeta.name}`);
    });

    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('dragover'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('dragover'));
    zona.addEventListener('drop', async (e) => {
      e.preventDefault();
      zona.classList.remove('dragover');
      await store.agregarArchivos([...e.dataTransfer.files]);
    });
  }

  function refrescar() {
    reconstruirSelector();
    const archivo = store.activo();
    if (!archivo) {
      editor.value = '';
      preview.innerHTML =
        '<div class="empty-state"><div class="big">📝</div><strong>Sin archivo activo</strong>' +
        '<span>Carga un archivo para editarlo aquí.</span></div>';
      fijarEstado('Listo para cargar archivos.');
      return;
    }
    if (editor.value !== archivo.texto) editor.value = archivo.texto;
    selector.value = archivo.id;
    render(archivo.ext, archivo.texto);
    fijarEstado(`${store.archivos.length} archivo(s) cargado(s).`);
  }

  function reconstruirSelector() {
    selector.innerHTML = '';
    if (!store.archivos.length) {
      selector.innerHTML = '<option value="">Sin archivos</option>';
      return;
    }
    store.archivos.forEach((archivo) => {
      const opcion = document.createElement('option');
      opcion.value = archivo.id;
      opcion.textContent = `${archivo.nombre} (${archivo.ext.toUpperCase()})`;
      selector.append(opcion);
    });
  }

  function alEscribir() {
    const archivo = store.activo();
    if (!archivo) return;
    store.actualizar(archivo.id, editor.value);
    render(archivo.ext, editor.value);
  }

  async function render(ext, texto) {
    if (ext === 'mmd' || ext === 'mermaid') {
      preview.replaceChildren(await util.nodoMermaid(texto));
      return;
    }
    if (ext === 'md' || ext === 'markdown') return util.markdownEnHtml(texto, preview);

    if (ext === 'csv' || ext === 'tsv') {
      preview.innerHTML = util.csvATabla(texto, ext === 'tsv' ? '\t' : undefined);
      return;
    }
    if (ext === 'json') {
      preview.innerHTML = `<pre><code>${util.escapeHtml(util.jsonBonito(texto))}</code></pre>`;
      return;
    }
    if (['xml', 'bpmn', 'drawio'].includes(ext)) {
      preview.innerHTML = `<pre><code>${util.escapeHtml(util.formatearXml(texto))}</code></pre>`;
      return;
    }
    preview.innerHTML = `<pre><code>${util.escapeHtml(texto)}</code></pre>`;
  }

  async function guardarActivo() {
    const archivo = store.activo();
    if (!archivo) return util.aviso('No hay archivo activo', 'err');
    store.actualizar(archivo.id, editor.value);
    await util.guardar(archivo.nombre, editor.value);
    fijarEstado(`Guardado: ${archivo.nombre}`);
  }

  async function exportarImagen() {
    const archivo = store.activo();
    util.ocupado(true);
    try {
      const svg = preview.querySelector('svg');
      const nombre = archivo ? archivo.nombre : 'preview';
      const blob = svg
        ? await util.svgAPng(svg)
        : await util.textoAPng(nombre, editor.value, document.documentElement.dataset.theme);
      await util.guardar(`${nombre.replace(/\.[^.]+$/, '')}.png`, blob, 'image/png');
    } catch (error) {
      util.aviso(`No se pudo exportar PNG: ${error.message}`, 'err');
    } finally {
      util.ocupado(false);
    }
  }

  function fijarEstado(texto) { estado.textContent = texto; }

  window.Vizu.registrar({
    id: 'v2',
    nombre: 'V2 · Editor en vivo',
    descripcion: 'Dos paneles fijos estilo markdown live preview: escribes a la izquierda y el resultado aparece a la derecha.',
    raiz,
    iniciar,
    refrescar
  });
})();
