# Recetas reproducibles de produccion y QA

- **SVG y texto:** construir geometría, ejes, etiquetas legibles y flechas con SVG; convertir a PNG con navegador o herramienta SVG disponible, comparando visualmente con el diseño solicitado. No presumir `Inter` ni `Chromium`.
- **Globo didáctico:** NumPy/SciPy/Pillow permiten raycasting ortografico y seccion de capas; comprobar alfa de las nubes y no prometer 3D real si solo hay imagen 2.5D.
- **Escenas contiguas:** generar tiras con condiciones de borde iguales; inspeccionar las uniones en una hoja de contacto.
- **HTML de lección:** usar estilos y recursos admitidos por el sanitizador actual de P2LRN. No confundir HTML comun con sandbox de arrastrar.
- **Imágenes y activos:** convertir a WebP con dimensiones apropiadas, transparencia cuando proceda, descripciones `alt`, procedencia y licencia verificadas. No asumir que por estar en un paquete npm un recurso sea libre.
- **Visibilidad:** captura en anchos de escritorio/tableta/móvil y buscar recorte horizontal, tipografía superpuesta y elementos de baja legibilidad. Revisar visualmente; el simple conteo de imágenes cargadas no basta.
- **Interactividad:** clicks, teclado, puntero y táctil se ensayan por separado con el componente existente; los eventos sinteticos no equivalen a gestos reales.
- **Reproducibilidad:** preparar comandos a partir de rutas relativas y un entorno detectado. Una prueba desde carpeta limpia solo es válida si todas las dependencias estan declaradas y disponibles. No atribuir una prueba previa al entorno actual.
- **Reportes:** incluir entradas, outputs, versiones, SHA-256, pruebas y límites. Si se edito el ZIP de un usuario, comprobar que no perdio ficheros ni cambios ajenos.
