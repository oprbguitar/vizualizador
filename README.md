# Vizualizador Offline (Chrome)

App offline para visualizar diagramas y documentos con **live editor + live preview**.

## Mejoras implementadas

- Estructura ordenada: `assets/css`, `assets/js`, `assets/vendor`.
- Vista paralela real: editor a la izquierda y preview a la derecha.
- Markdown mejorado para tablas (`| col |`), listas, encabezados, enlaces, código y bloques Mermaid.
- Tema azul/dorado con interruptor **Dark/Light**.
- Service Worker actualizado para evitar caché vieja y duplicados visuales.

## Ejecutar

```bash
python3 -m http.server 8080
```

Abrir `http://localhost:8080` en Chrome.
