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
Aplicación web local (PWA) para Chrome con soporte offline para cargar archivos de diagramas, ver **raw + preview en paralelo**, y exportar a PDF/PNG.

## Soporte implementado (MVP)

Se priorizaron formatos realistas sin librerías externas, para garantizar uso offline:

- Texto/diagramas (preview textual): `.mmd`, `.mermaid`, `.puml`, `.c4`, `.erd`, `.sql`, `.zen`, `.mpp`, `.vsdx`, `.mm`, `.xmind`
- Markdown render básico: `.md`
- Tabla / datos: `.csv`, `.json`
- XML-like: `.drawio`, `.bpmn`, `.xml`

> Formatos binarios propietarios (`.fig`, `.sketch`, `.xd`, `.psd`, `.mpp` real binario, `.vsdx` complejo) se cargan como texto sólo si el archivo es legible. Si no, quedan fuera del render avanzado.

## Funciones

- Arrastrar y soltar archivos.
- Visualización paralela por archivo (raw + render).
- Live preview al cargar.
- Exportar a PDF usando impresión del navegador.
- Exportar PNG del panel seleccionado.
- Selección de carpeta de salida mediante File System Access API (Chrome).
- Funcionamiento offline con Service Worker.

## Ejecutar

```bash
python3 -m http.server 8080
```

Abrir `http://localhost:8080` en Chrome.

## Nota

Para instalar como “app de Chrome”, usa **Instalar aplicación** desde la barra de direcciones cuando Chrome detecte la PWA.
