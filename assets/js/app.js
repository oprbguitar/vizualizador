/* ==========================================================================
   Arranque — Vizualizador Offline
   Registra las tres versiones de visualización, conmuta entre ellas con las
   pestañas de la cabecera y mantiene lo que comparten: tema, arrastrar y
   soltar, atajos y Service Worker.
   ========================================================================== */

(() => {
  'use strict';
  const { store, util, vistas, claves } = window.Vizu;

  const barraVersiones = document.getElementById('versiones');
  const descripcion = document.getElementById('versionDesc');
  const botonTema = document.getElementById('themeBtn');
  const pildoraRed = document.getElementById('netPill');
  const overlay = document.getElementById('dropOverlay');

  let vistaActiva = null;
  let tema = 'dark';
  let profundidadArrastre = 0;

  /* ---------------------------------------------------------- versiones */

  function pintarVersiones() {
    barraVersiones.innerHTML = '';
    vistas.forEach((vista) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = `version${vista.id === vistaActiva?.id ? ' active' : ''}`;
      boton.dataset.version = vista.id;
      boton.title = vista.descripcion;
      boton.innerHTML = `<span class="version-num">${vista.id.toUpperCase()}</span><span class="version-name">${vista.nombre.replace(/^V\d+ · /, '')}</span>`;
      boton.addEventListener('click', () => activarVista(vista.id));
      barraVersiones.append(boton);
    });
  }

  function activarVista(id) {
    const vista = vistas.find((v) => v.id === id) || vistas[vistas.length - 1];
    if (vistaActiva === vista) return;

    vistas.forEach((v) => {
      v.raiz.hidden = v !== vista;
    });
    vistaActiva = vista;
    document.body.dataset.vista = vista.id;
    localStorage.setItem(claves.vista, vista.id);

    vista.iniciar();
    vista.refrescar();
    vista.sucia = false;

    pintarVersiones();
    descripcion.textContent = vista.descripcion;
    barraVersiones.querySelector('.version.active')?.classList.add('recien');
    setTimeout(() => barraVersiones.querySelector('.recien')?.classList.remove('recien'), 600);
  }

  /* ------------------------------------------------------ estado global */

  store.on((evento) => {
    vistas.forEach((v) => {
      if (v !== vistaActiva) v.sucia = true;
    });
    // 'texto' lo origina siempre la vista activa: repintarla la interrumpiría.
    if (evento !== 'texto') vistaActiva?.refrescar();
  });

  function aplicarTema(nuevo, { silencioso = false } = {}) {
    tema = nuevo;
    document.documentElement.setAttribute('data-theme', tema);
    botonTema.querySelector('.btn-ico').textContent = tema === 'dark' ? '🌙' : '☀️';
    botonTema.querySelector('.btn-label').textContent = tema === 'dark' ? 'Dark' : 'Light';
    localStorage.setItem(claves.tema, tema);

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: tema === 'dark' ? 'default' : 'neutral',
      flowchart: { curve: 'basis', useMaxWidth: true }
    });

    if (!silencioso) {
      vistas.forEach((v) => (v.sucia = true));
      vistaActiva?.refrescar();
      util.aviso(`Tema ${tema === 'dark' ? 'oscuro' : 'claro'}`);
    }
  }

  /* ------------------------------------------------- arrastrar y soltar */

  window.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    e.preventDefault();
    profundidadArrastre += 1;
    overlay.classList.add('visible');
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', () => {
    profundidadArrastre = Math.max(0, profundidadArrastre - 1);
    if (!profundidadArrastre) overlay.classList.remove('visible');
  });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    profundidadArrastre = 0;
    overlay.classList.remove('visible');
    const archivos = [...(e.dataTransfer?.files || [])];
    if (archivos.length) await store.agregarArchivos(archivos);
  });

  /* -------------------------------------------------------------- atajos */

  window.addEventListener('keydown', (e) => {
    // Alt+1/2/3 salta entre versiones
    if (e.altKey && ['1', '2', '3'].includes(e.key)) {
      e.preventDefault();
      activarVista(`v${e.key}`);
      return;
    }
    if (!e.ctrlKey && !e.metaKey) return;
    const tecla = e.key.toLowerCase();
    if (tecla === 'p') { e.preventDefault(); window.print(); }
    else if (tecla === 'd') { e.preventDefault(); aplicarTema(tema === 'dark' ? 'light' : 'dark'); }
    else if (tecla === 's') {
      e.preventDefault();
      const archivo = store.activo();
      if (archivo) util.guardar(archivo.nombre, archivo.texto);
    }
  });

  botonTema.addEventListener('click', () => aplicarTema(tema === 'dark' ? 'light' : 'dark'));

  function pintarRed() {
    const enLinea = navigator.onLine;
    pildoraRed.textContent = enLinea ? 'Offline ready' : 'Sin conexión · todo sigue';
    pildoraRed.classList.toggle('offline', !enLinea);
  }
  window.addEventListener('online', pintarRed);
  window.addEventListener('offline', pintarRed);

  /* ------------------------------------------------------------ arranque */

  marked.setOptions({ gfm: true, breaks: false });
  aplicarTema(localStorage.getItem(claves.tema) === 'light' ? 'light' : 'dark', { silencioso: true });

  if (!window.Vizu.restaurar()) {
    const v3 = vistas.find((v) => v.id === 'v3');
    store.abrir('bienvenida.md', v3 ? v3.demo : '# Vizualizador Offline\n', { silencioso: true });
  }

  activarVista(localStorage.getItem(claves.vista) || 'v3');
  pintarRed();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* el modo offline es opcional: la app funciona igual */
    });
  }
})();
