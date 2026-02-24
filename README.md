# Vizualizador Offline (Chrome)

Editor y preview en vivo para Markdown (similar a markdownlivepreview), con Mermaid y modo offline.

## Mejoras clave

- Interfaz limpia de 2 paneles fijos: **Editor** y **Preview** (sin tarjetas repetidas).
- Render Markdown robusto con `marked` (GFM: tablas, listas, encabezados, etc.).
- Mermaid en vivo para bloques ```mermaid``` dentro de `.md` y archivos `.mmd/.mermaid`.
- Paleta azul + dorado con alternancia Dark/Light.
- Guardado del archivo activo (descarga o carpeta elegida en Chrome).
- Offline con Service Worker (`sw.js` v4) y limpieza de cachés antiguas.

## Ejecutar

```bash
python3 -m http.server 8080
```

Abrir `http://localhost:8080` en Chrome.
