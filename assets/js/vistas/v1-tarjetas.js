/* ==========================================================================
   V1 · Tarjetas — la vista original del repositorio.
   Una tarjeta por archivo: código editable a la izquierda, render a la
   derecha. Se conserva la lógica de siempre (prepend, tarjeta seleccionada,
   exportar PNG de la tarjeta activa) apoyada en el almacén compartido.
   ========================================================================== */

(() => {
  'use strict';
  const { store, util } = window.Vizu;

  const raiz = document.getElementById('vista-v1');
  const rejilla = document.getElementById('v1-previewGrid');
  const plantilla = document.getElementById('v1-previewTemplate');
  const entrada = document.getElementById('v1-fileInput');
  const zona = document.getElementById('v1-dropzone');
  const estadoCarpeta = document.getElementById('v1-folderStatus');

  let seleccionada = null;
  let iniciada = false;

  function iniciar() {
    if (iniciada) return;
    iniciada = true;

    entrada.addEventListener('change', async (e) => {
      await store.agregarArchivos([...e.target.files]);
      e.target.value = '';
    });

    document.getElementById('v1-clearBtn').addEventListener('click', () => store.limpiar());
    document.getElementById('v1-exportPdfBtn').addEventListener('click', () => window.print());
    document.getElementById('v1-exportImgBtn').addEventListener('click', exportarImagen);
    document.getElementById('v1-pickFolderBtn').addEventListener('click', async () => {
      await util.elegirCarpeta();
      pintarCarpeta();
    });

    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('dragover'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('dragover'));
    zona.addEventListener('drop', async (e) => {
      e.preventDefault();
      zona.classList.remove('dragover');
      await store.agregarArchivos([...e.dataTransfer.files]);
    });
  }

  /* Reconstruye la rejilla a partir del almacén (el más reciente arriba). */
  function refrescar() {
    rejilla.innerHTML = '';
    seleccionada = null;
    [...store.archivos].reverse().forEach(pintarTarjeta);
    pintarCarpeta();

    if (!store.archivos.length) {
      rejilla.innerHTML =
        '<div class="empty-state"><div class="big">🗂️</div><strong>Sin archivos abiertos</strong>' +
        '<span>Arrastra uno sobre la ventana o usa el selector de arriba.</span></div>';
    }
  }

  function pintarTarjeta(archivo) {
    const nodo = plantilla.content.cloneNode(true);
    const tarjeta = nodo.querySelector('.card');
    const bruto = nodo.querySelector('.raw');
    const render = nodo.querySelector('.rendered');

    nodo.querySelector('.filename').textContent = archivo.nombre;
    nodo.querySelector('.meta').textContent =
      `${util.etiqueta(archivo.ext)} • ${Math.max(1, Math.round(new Blob([archivo.texto]).size / 1024))} KB`;
    bruto.value = archivo.texto;

    tarjeta.addEventListener('click', () => {
      rejilla.querySelectorAll('.card.seleccionada').forEach((c) => c.classList.remove('seleccionada'));
      tarjeta.classList.add('seleccionada');
      seleccionada = tarjeta;
      store.activar(archivo.id);
    });

    bruto.addEventListener(
      'input',
      util.debounce(() => {
        store.actualizar(archivo.id, bruto.value);
        renderPorTipo(archivo.ext, bruto.value, render);
      }, 150)
    );

    rejilla.append(nodo);
    const referencia = rejilla.lastElementChild;
    if (archivo.id === store.activoId || !seleccionada) {
      seleccionada = referencia;
      referencia.classList.add('seleccionada');
    }
    renderPorTipo(archivo.ext, archivo.texto, render);
  }

  async function renderPorTipo(ext, texto, contenedor) {
    if (ext === 'md' || ext === 'markdown') return util.markdownEnHtml(texto, contenedor);

    if (ext === 'mmd' || ext === 'mermaid') {
      contenedor.replaceChildren(await util.nodoMermaid(texto));
      return;
    }
    if (ext === 'csv' || ext === 'tsv') {
      contenedor.innerHTML = util.csvATabla(texto, ext === 'tsv' ? '\t' : undefined);
      return;
    }
    if (ext === 'json') {
      contenedor.innerHTML = `<pre>${util.escapeHtml(util.jsonBonito(texto))}</pre>`;
      return;
    }
    if (['xml', 'bpmn', 'drawio'].includes(ext)) {
      contenedor.innerHTML = `<pre>${util.escapeHtml(util.formatearXml(texto))}</pre>`;
      return;
    }
    contenedor.innerHTML = `<h3>Preview textual</h3><pre>${util.escapeHtml(texto)}</pre>`;
  }

  function pintarCarpeta() {
    estadoCarpeta.textContent = store.carpeta ? `Carpeta: ${store.carpeta.name}` : 'Carpeta: sin seleccionar';
  }

  /* Exporta la tarjeta seleccionada: su diagrama si lo tiene, si no su texto. */
  async function exportarImagen() {
    const tarjeta = seleccionada || rejilla.querySelector('.card');
    if (!tarjeta) return util.aviso('No hay ninguna tarjeta que exportar', 'err');

    util.ocupado(true);
    try {
      const svg = tarjeta.querySelector('.rendered svg');
      const nombre = tarjeta.querySelector('.filename').textContent || 'tarjeta';
      const blob = svg
        ? await util.svgAPng(svg)
        : await util.textoAPng(nombre, tarjeta.querySelector('.raw').value, document.documentElement.dataset.theme);
      await util.guardar(`${nombre.replace(/\.[^.]+$/, '')}.png`, blob, 'image/png');
    } catch (error) {
      util.aviso(`No se pudo exportar PNG: ${error.message}`, 'err');
    } finally {
      util.ocupado(false);
    }
  }

  window.Vizu.registrar({
    id: 'v1',
    nombre: 'V1 · Tarjetas',
    descripcion: 'La vista original: una tarjeta por archivo, con el código editable a la izquierda y su render a la derecha.',
    raiz,
    iniciar,
    refrescar
  });
})();
