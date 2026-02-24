# Vizualizador Offline (Chrome)

Ahora el proyecto está **organizado por carpetas** y con **live preview real** para Mermaid.

## Estructura

- `index.html`
- `assets/css/styles.css`
- `assets/js/app.js`
- `assets/vendor/mermaid.min.js`
- `sw.js`
- `manifest.json`

## Qué funciona

- Vista paralela por archivo: **código a la izquierda + visualizador a la derecha**.
- Drag & drop y selector de archivos.
- Live preview Mermaid para `.mmd`, `.mermaid` y bloques Mermaid dentro de `.md`.
- Preview para `.csv`, `.json`, `.xml`, `.drawio`, `.bpmn` y textual para otros formatos.
- Exportar PDF (impresión) y PNG.
- Guardado en carpeta elegida en Chrome (File System Access API).
- Funciona offline con Service Worker.

## Ejecutar

```bash
python3 -m http.server 8080
```

Abrir `http://localhost:8080` en Chrome.
