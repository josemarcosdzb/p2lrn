# Auditoría visual SaaS de P2LRN Studio — 5 de noviembre de 2026

Rama: `mejorastudio`. Dos vistas: Studio web y `@p2lrn/studio` local dentro de HTML. No se ha alterado `main`.

## Diagnóstico medido

Pruebas Chrome/Edge en 1440×960, 860×900 y 390×840. Antes de los ajustes, a 390 px la barra ocupaba 419 px en Inicio y 475 px en Diseño; el lienzo comenzaba en Y=784 en web y Y=920 en NPM. La cabecera de lección aparecía repetida y los mandos de multimedia dispersos en el interior.

## Cambios

- Cabecera y menú comunes: Archivo conserva las acciones de Nuevo, Abrir y Exportar cuando se ocultan sus accesos redundantes en móvil. Editar y Vista alumno siguen visibles.
- En pantallas estrechas, cinta de herramientas desplazable horizontalmente y árbol recuperable mediante Esquema, con estado accesible.
- Propiedades de lección contiene título y descripción editables sin un segundo encabezado grande visible. Las lecciones existentes mantienen su HTML.
- Imagen y Vídeo pasan a Insertar. Opciones de multimedia sigue incluyendo controles de tamaño, eliminación y portada.
- Diseño avisa cuando no hay un objeto seleccionado; al seleccionarlo, muestra sus controles. La navegación con flechas incluye la pestaña contextual Tabla.
- Archivo cierra con Escape o pulsación exterior. Los controles visibles comprobados superan 24×24 píxeles.

## Resultados a 390 px

| Medida | Antes | Después |
|---|---:|---:|
| Barra Inicio | 419 px | 248 px |
| Barra Diseño | 475 px | 228 px |
| Inicio del lienzo web | Y=784 | Y=363 |
| Inicio del lienzo NPM | Y=920 | Y=520 |

No se detectó desbordamiento horizontal de página en 390, 860 ni 1440 píxeles en las dos aplicaciones.

Verificación: `node scripts/verify-studio-saas-ui.mjs --port 5531 --output DIRECTORIO_EXISTENTE`. Genera 18 capturas de ambas vistas y comprueba menú, estructura, propiedades, multimedia, pestañas contextuales y tamaño de controles. Capturas locales en `C:\Users\Usuario\Downloads\p2lrn-mejorastudio-preview-1d4cd08d\qa-saas-validated`.

Referencias de diseño: W3C WAI-ARIA APG Toolbar; WCAG 2.2, criterio 2.5.8; IBM Carbon Menu y Microsoft Fluent 2 Toolbar. La revisión no equivale a certificación WCAG, prueba con lector de pantalla o dispositivo físico, ni añade un motor completo de capas PPTX/PDF.

No publicar NPM ni fusionar con `main` sin orden expresa.
