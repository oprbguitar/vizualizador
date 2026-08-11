/* ==========================================================================
   Núcleo compartido — Vizualizador Offline
   Un único almacén de archivos y un puñado de utilidades que las tres
   versiones de visualización (V1, V2 y V3) reutilizan.
   ========================================================================== */

(() => {
  'use strict';

  /* Extensiones aceptadas: las mismas desde la v1, más algunas variantes. */
  const SOPORTADAS = new Set([
    'md', 'markdown', 'mmd', 'mermaid', 'puml', 'drawio', 'vsdx', 'erd', 'sql',
    'mm', 'xmind', 'c4', 'mpp', 'csv', 'tsv', 'json', 'zen', 'bpmn', 'xml', 'txt'
  ]);

  const ETIQUETAS = {
    md: 'Markdown', markdown: 'Markdown', mmd: 'Mermaid', mermaid: 'Mermaid',
    csv: 'CSV', tsv: 'TSV', json: 'JSON', xml: 'XML', bpmn: 'BPMN', drawio: 'draw.io',
    puml: 'PlantUML', c4: 'C4', erd: 'ERD', sql: 'SQL', zen: 'Zen', mm: 'FreeMind',
    xmind: 'XMind', mpp: 'MS Project', vsdx: 'Visio', txt: 'Texto'
  };

  const CLAVE_ARCHIVOS = 'vizualizador:archivos:v3';
  const CLAVE_TEMA = 'vizualizador:tema';
  const CLAVE_VISTA = 'vizualizador:vista';
  const LIMITE_PERSISTENCIA = 1_500_000;

  const uid = () =>
    crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const extension = (nombre) => (nombre.includes('.') ? nombre.split('.').pop().toLowerCase() : 'txt');

  const etiqueta = (ext) => ETIQUETAS[ext] || (ext ? ext.toUpperCase() : 'TEXTO');

  const escapeHtml = (valor = '') =>
    String(valor)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  function debounce(fn, espera) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), espera);
    };
  }

  /* ------------------------------------------------------------- almacén */

  const oyentes = new Set();

  const store = {
    archivos: [],
    activoId: null,
    carpeta: null,

    on(fn) { oyentes.add(fn); return () => oyentes.delete(fn); },
    emitir(evento) { oyentes.forEach((fn) => fn(evento, store)); },

    activo() { return store.archivos.find((a) => a.id === store.activoId) || null; },
    buscar(id) { return store.archivos.find((a) => a.id === id) || null; },

    abrir(nombre, texto, { silencioso = false } = {}) {
      const archivo = { id: uid(), nombre, ext: extension(nombre), texto };
      store.archivos.push(archivo);
      store.activoId = archivo.id;
      persistir();
      if (!silencioso) store.emitir('abierto');
      return archivo;
    },

    activar(id) {
      if (store.activoId === id) return;
      store.activoId = id;
      persistir();
      store.emitir('activo');
    },

    actualizar(id, texto) {
      const archivo = store.buscar(id);
      if (!archivo || archivo.texto === texto) return;
      archivo.texto = texto;
      persistir();
      store.emitir('texto');
    },

    cerrar(id) {
      const i = store.archivos.findIndex((a) => a.id === id);
      if (i === -1) return;
      store.archivos.splice(i, 1);
      if (store.activoId === id) {
        const siguiente = store.archivos[i] || store.archivos[i - 1] || null;
        store.activoId = siguiente ? siguiente.id : null;
      }
      persistir();
      store.emitir('cerrado');
    },

    limpiar() {
      store.archivos = [];
      store.activoId = null;
      persistir();
      store.emitir('limpio');
    },

    async agregarArchivos(lista) {
      let añadidos = 0;
      for (const file of lista) {
        const ext = extension(file.name);
        if (!SOPORTADAS.has(ext)) continue;
        try {
          store.abrir(file.name, await file.text(), { silencioso: true });
          añadidos += 1;
        } catch {
          util.aviso(`No se pudo leer ${file.name}`, 'err');
        }
      }
      if (añadidos) {
        store.emitir('abierto');
        util.aviso(`${añadidos} archivo(s) abierto(s)`, 'ok');
      } else {
        util.aviso('Ningún archivo compatible en la selección', 'err');
      }
      return añadidos;
    }
  };

  const persistir = debounce(() => {
    try {
      const carga = JSON.stringify({ activoId: store.activoId, archivos: store.archivos });
      if (carga.length > LIMITE_PERSISTENCIA) return;
      localStorage.setItem(CLAVE_ARCHIVOS, carga);
    } catch {
      /* cuota llena: seguimos sin persistir */
    }
  }, 600);

  function restaurar() {
    try {
      const bruto = localStorage.getItem(CLAVE_ARCHIVOS);
      if (!bruto) return false;
      const datos = JSON.parse(bruto);
      if (!Array.isArray(datos.archivos) || !datos.archivos.length) return false;
      store.archivos = datos.archivos;
      store.activoId = datos.archivos.some((a) => a.id === datos.activoId)
        ? datos.activoId
        : datos.archivos[0].id;
      return true;
    } catch {
      return false;
    }
  }

  /* ----------------------------------------------------------- utilidades */

  let contadorMermaid = 0;

  const util = {
    uid,
    extension,
    etiqueta,
    escapeHtml,
    debounce,
    SOPORTADAS,

    aviso(mensaje, tipo = '') {
      const contenedor = document.getElementById('toasts');
      if (!contenedor) return;
      const nodo = document.createElement('div');
      nodo.className = `toast ${tipo}`.trim();
      nodo.innerHTML = `<span>${tipo === 'ok' ? '✅' : tipo === 'err' ? '⚠️' : 'ℹ️'}</span><span>${escapeHtml(mensaje)}</span>`;
      contenedor.append(nodo);
      setTimeout(() => {
        nodo.classList.add('out');
        nodo.addEventListener('animationend', () => nodo.remove(), { once: true });
      }, 3200);
    },

    ocupado(activo) {
      const barra = document.getElementById('progress');
      if (!barra) return;
      barra.classList.toggle('active', activo);
      if (!activo) setTimeout(() => (barra.style.width = ''), 350);
    },

    /* Dibuja un bloque Mermaid y devuelve el nodo listo para insertar.
       Si falla, devuelve el error visible sin tumbar el resto del documento. */
    async nodoMermaid(codigo) {
      const envoltorio = document.createElement('div');
      try {
        const id = `merm-${Date.now().toString(36)}-${contadorMermaid++}`;
        const { svg } = await mermaid.render(id, codigo.trim());
        envoltorio.className = 'mermaid-wrap';
        envoltorio.innerHTML = svg;
      } catch (error) {
        envoltorio.className = 'mermaid-error';
        envoltorio.innerHTML = `<strong>Mermaid no pudo dibujar este bloque</strong>
          <pre>${escapeHtml((error && error.message) || 'Sintaxis inválida')}</pre>
          <pre><code>${escapeHtml(codigo)}</code></pre>`;
      }
      return envoltorio;
    },

    /* Markdown con marked + sustitución de los bloques mermaid por SVG. */
    async markdownEnHtml(md, contenedor) {
      contenedor.innerHTML = marked.parse(md || '');
      const bloques = contenedor.querySelectorAll('code.language-mermaid, code.language-mmd');
      for (const bloque of bloques) {
        const pre = bloque.closest('pre') || bloque;
        pre.replaceWith(await util.nodoMermaid(bloque.textContent));
      }
    },

    csvATabla(csv, delimitador) {
      const filas = util.parsearDelimitado(csv, delimitador || util.detectarDelimitador(csv));
      if (!filas.length) return '<p><em>Archivo de datos vacío</em></p>';
      const [cabecera, ...cuerpo] = filas;
      return (
        '<table><thead><tr>' +
        cabecera.map((c) => `<th>${escapeHtml(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        cuerpo
          .map((fila) => '<tr>' + cabecera.map((_, i) => `<td>${escapeHtml(fila[i] ?? '')}</td>`).join('') + '</tr>')
          .join('') +
        '</tbody></table>'
      );
    },

    detectarDelimitador(bruto) {
      const linea = bruto.split(/\r?\n/, 1)[0] || '';
      const cuentas = [',', ';', '\t', '|'].map((d) => [d, linea.split(d).length - 1]);
      cuentas.sort((a, b) => b[1] - a[1]);
      return cuentas[0][1] > 0 ? cuentas[0][0] : ',';
    },

    parsearDelimitado(bruto, delimitador) {
      const filas = [];
      let fila = [];
      let valor = '';
      let entrecomillado = false;
      const texto = bruto.replace(/\r\n?/g, '\n').trim();

      for (let i = 0; i < texto.length; i += 1) {
        const c = texto[i];
        if (entrecomillado) {
          if (c === '"' && texto[i + 1] === '"') { valor += '"'; i += 1; }
          else if (c === '"') entrecomillado = false;
          else valor += c;
          continue;
        }
        if (c === '"') entrecomillado = true;
        else if (c === delimitador) { fila.push(valor); valor = ''; }
        else if (c === '\n') { fila.push(valor); filas.push(fila); fila = []; valor = ''; }
        else valor += c;
      }
      if (valor !== '' || fila.length) { fila.push(valor); filas.push(fila); }
      return filas;
    },

    jsonBonito(bruto) {
      try { return JSON.stringify(JSON.parse(bruto), null, 2); }
      catch { return 'JSON inválido'; }
    },

    formatearXml(xml) {
      const compacto = xml.replace(/>\s+</g, '><').trim();
      let nivel = 0;
      return compacto
        .replace(/></g, '>\n<')
        .split('\n')
        .map((linea) => {
          if (/^<\/.+/.test(linea)) nivel = Math.max(0, nivel - 1);
          const salida = '  '.repeat(nivel) + linea;
          if (/^<[^!?/][^>]*[^/]>$/.test(linea) && !/^<.+<\/.+>$/.test(linea)) nivel += 1;
          return salida;
        })
        .join('\n');
    },

    descargar(blob, nombre) {
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    async elegirCarpeta() {
      if (!window.showDirectoryPicker) {
        util.aviso('La API de carpetas solo está en Chrome/Edge de escritorio', 'err');
        return null;
      }
      try {
        store.carpeta = await window.showDirectoryPicker();
        store.emitir('carpeta');
        util.aviso(`Guardaré en «${store.carpeta.name}»`, 'ok');
        return store.carpeta;
      } catch {
        return null; /* el usuario canceló */
      }
    },

    /* Escribe en la carpeta elegida o, si no hay, descarga el archivo. */
    async guardar(nombre, contenido, tipo = 'text/plain;charset=utf-8') {
      const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
      if (store.carpeta) {
        try {
          const handle = await store.carpeta.getFileHandle(nombre, { create: true });
          const escritor = await handle.createWritable();
          await escritor.write(blob);
          await escritor.close();
          util.aviso(`Guardado en ${store.carpeta.name}/${nombre}`, 'ok');
          return true;
        } catch (error) {
          util.aviso(`No se pudo escribir en la carpeta: ${error.message}`, 'err');
        }
      }
      util.descargar(blob, nombre);
      util.aviso(`Descargado: ${nombre}`, 'ok');
      return false;
    },

    /* Rasteriza un SVG (normalmente un diagrama Mermaid) a PNG 2x. */
    svgAPng(svg) {
      return new Promise((resolve, reject) => {
        const clon = svg.cloneNode(true);
        const caja = svg.getBoundingClientRect();
        const ancho = Math.max(320, Math.round(caja.width || 800));
        const alto = Math.max(200, Math.round(caja.height || 600));
        clon.setAttribute('width', ancho);
        clon.setAttribute('height', alto);
        clon.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

        const fuente = new XMLSerializer().serializeToString(clon);
        const imagen = new Image();
        imagen.onload = () => {
          const escala = 2;
          const lienzo = document.createElement('canvas');
          lienzo.width = ancho * escala;
          lienzo.height = alto * escala;
          const ctx = lienzo.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
          lienzo.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('lienzo vacío'))), 'image/png');
        };
        imagen.onerror = () => reject(new Error('el SVG no se pudo rasterizar'));
        imagen.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fuente)}`;
      });
    },

    /* Respaldo para exportar PNG cuando no hay ningún diagrama a la vista. */
    textoAPng(titulo, texto, tema) {
      const lienzo = document.createElement('canvas');
      lienzo.width = 1600;
      lienzo.height = 1000;
      const ctx = lienzo.getContext('2d');
      const oscuro = tema !== 'light';

      const degradado = ctx.createLinearGradient(0, 0, lienzo.width, lienzo.height);
      degradado.addColorStop(0, oscuro ? '#08142c' : '#ffffff');
      degradado.addColorStop(1, oscuro ? '#12284b' : '#e4edff');
      ctx.fillStyle = degradado;
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);

      ctx.fillStyle = oscuro ? '#eabf65' : '#8f6204';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(titulo, 40, 58);

      ctx.fillStyle = oscuro ? '#a3b6db' : '#47638f';
      ctx.font = '16px sans-serif';
      ctx.fillText(new Date().toLocaleString(), 40, 84);

      ctx.fillStyle = oscuro ? '#eaf1ff' : '#102546';
      ctx.font = '16px ui-monospace, monospace';
      texto.split('\n').slice(0, 46).forEach((linea, i) => ctx.fillText(linea.slice(0, 150), 40, 126 + i * 19));

      return new Promise((resolve, reject) =>
        lienzo.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('lienzo vacío'))), 'image/png')
      );
    }
  };

  /* Registro de vistas: cada versión se apunta aquí al cargarse. */
  window.Vizu = {
    store,
    util,
    vistas: [],
    claves: { tema: CLAVE_TEMA, vista: CLAVE_VISTA },
    restaurar,
    registrar(vista) { window.Vizu.vistas.push(vista); }
  };
})();
