# Blueprint para crear P2LRN sin túnel

Esta es una representación temporal de entrada, no el manifiesto normativo del paquete. El script produce la estructura Core 0.4.0 `META-INF/manifest.json` + `content/graph.json` y las representaciones nativas.

## Estructura

```json
{
  "title": "Curso de Ciencias",
  "description": "Descripción pedagógica",
  "language": "es",
  "units": [{
    "title": "Unidad 1",
    "role": "module",
    "lessons": [
      {"type":"lesson","title":"Introducción","text":"El Sol es una estrella."},
      {"type":"quiz","title":"Evaluación","questions":[
        {"id":"q1","type":"single-choice","prompt":"¿Qué es el Sol?","points":1,
         "choices":[{"id":"a","text":"Una estrella"},{"id":"b","text":"Un planeta"}],
         "solution":{"choiceIds":["a"]}}
      ]}
    ]
  }]
}
```

Las actividades de cada unidad van en `lessons` en su orden pedagógico. No incluyas credenciales ni datos del alumnado.

## Actividades soportadas

- Lección `{"type":"lesson","title":"...","text":"..."}` o con `html` pasivo sin JavaScript ni eventos.
- Cuestionario `{"type":"quiz","title":"...","questions":[...]}`.
- Juego `{"type":"game","kind":"matching","title":"...","questions":[...]}`.
- Componente `{"type":"component","title":"Consejo","heading":"Recuerda","text":"...","tone":"note"}` (`tone`: info/note/warning/success).
- Enlace no descargado: `{"type":"url","title":"Consulta","url":"https://..."}`.

## Preguntas nativas

Cada pregunta necesita `id` único, `type`, `prompt`, `points` entero positivo y `solution` para corrección sin servidor.

**Opción única / opción múltiple / verdadero-falso clásico:** `choices` es una lista `{id,text}` y `solution.choiceIds` indica los IDs correctos. En opción única y verdadero-falso clásico, solo una opción correcta; verdadero/falso clásico utiliza exactamente dos opciones.

**Verdadero/falso con varias afirmaciones (Toolkit 0.5.0-alpha.13, mismo perfil Core 0.4.0):** usar `trueFalseMode: "multiple"`, sin `choices`, con al menos dos afirmaciones `{id,text}` y una respuesta booleana para **cada** ID. Ejemplo:

```json
{"id":"vf1","type":"true-false","trueFalseMode":"multiple","prompt":"Indica V o F para cada frase","points":3,"statements":[{"id":"s1","text":"El Sol es una estrella"},{"id":"s2","text":"La Luna es una estrella"},{"id":"s3","text":"Marte es un planeta"}],"solution":{"answers":{"s1":true,"s2":false,"s3":true}}}
```

Esta estructura también puede presentarse como juego `{"type":"game","kind":"true-false",...}` y expandirse en varias rondas del Player. No duplicar la pregunta para fabricar las afirmaciones.


**Texto**: `{"id":"t1","type":"text","prompt":"Pista de la respuesta","points":1,"solution":{"acceptedAnswers":["MARTE"]}}`.

**Relacionar**: `{"id":"m1","type":"matching","prompt":"Relaciona","points":3,"left":[{"id":"l1","text":"Marte"},{"id":"l2","text":"Sol"},{"id":"l3","text":"Tierra"}],"right":[{"id":"r1","text":"Planeta rojo"},{"id":"r2","text":"Estrella"},{"id":"r3","text":"Planeta azul"}],"solution":{"pairs":[{"left":"l1","right":"r1"},{"left":"l2","right":"r2"},{"left":"l3","right":"r3"}]}}`.

**Ordenar**: `{"id":"o1","type":"ordering","prompt":"Ordena","points":3,"items":[{"id":"a","text":"Paso 1"},{"id":"b","text":"Paso 2"},{"id":"c","text":"Paso 3"}],"solution":{"order":["a","b","c"]}}`.

**Clasificar**: `items` y `categories` son objetos `{id,text}`, `solution.assignments` contiene objetos `{item,category}`; todas las asignaciones deben existir y ser únicas.

**Rellenar huecos**: `blanks:[{"id":"b1"}]`; `solution.answers:{"b1":["respuesta"]}`. Añade `body` para el texto y `inputMode: "text"` o `"drag"` cuando corresponda. Este empaquetador comprueba que ningún hueco carezca de solución.

## Reglas de los renderizadores de juego

`kind` convierte las preguntas a una presentación del Player sin duplicar su fuente:

- `matching` y `memory`: preguntas `matching` con **tres parejas** o más, claves y textos inequívocos.
- `ordering`: preguntas `ordering` de tres o más elementos.
- `3d-ordering`, `3d-matching`, `3d-classification`, `3d`: los tres tipos estructurados equivalentes. El motor no incluye ni copia WebGL, únicamente declara la preferencia oficial `.../3d-order-match`.
- `word-search`: al menos 3 preguntas de `text` con una única palabra normalizada de 3 a 16 letras.
- `rosco`: preguntas `text` con respuestas distintas; el motor necesita poder asignar una letra diferente presente en cada respuesta. No afirmar un rosco perfecto sin prueba visual.
- `crossword`: al menos cuatro respuestas con pistas y relación de letras. El algoritmo de distribución debe comprobarse en Player; el empaquetador advierte que no lo ha certificado gráficamente.
- `true-false`: dos o más afirmaciones con respuesta. `fill-blanks`: preguntas del mismo tipo. `classification`: preguntas de clasificación.

Los payloads con valores no enteros (por ejemplo 0.5 puntos) no están admitidos por este empaquetador offline. Usa puntos enteros. El paquete sirve para la creación dentro del chat; no publica contenido en un LMS ni conecta con el PC.

## Autoría y derechos del curso

Solo se admiten cuatro campos de autoría, todos opcionales excepto que la fecha se establece
automáticamente al crear un nuevo curso si no se suministra:

```json
{
  "title": "Curso de ejemplo",
  "language": "es",
  "author": "Profesora de ejemplo",
  "createdAt": "2026-10-26",
  "license": "CC BY 4.0",
  "copyrightHolder": "Profesora de ejemplo",
  "units": [{"title":"Unidad","lessons":[{"type":"lesson","title":"Inicio","text":"Contenido."}]}]
}
```

- `author` es el autor del **contenido educativo**. No inventar autores.
- `createdAt` es la fecha original del contenido, `AAAA-MM-DD`, no la fecha de cada exportación.
- `license` son las condiciones de uso y distribución, sin presumir una licencia predeterminada.
- `copyrightHolder` identifica el titular de los derechos, no necesariamente al autor.
- Guardar los datos bajo `course.extensions["https://p2lrn.org/ext/course-rights/1"]`.
- No agregar otros campos. No atribuir la autoría a programas o servicios.
- Si se vuelve a empaquetar un curso ya existente, conservar los cuatro valores originales.

## Límites comprobados del empaquetador instalado

Esta Skill conserva el esquema de manifiesto Core 0.4.0 que también utiliza el Toolkit Node 0.5.0-alpha.13; no significa que incorpore todas las funciones de esa versión de Toolkit/Studio. No adjunta Player, no ofrece paquetes CMD/ZIP autoejecutables, no soporta autorización LTI ni prueba gráficos 3D, y su verificador no sustituye la validación de todos los perfiles oficiales. Consulta `toolkit-parity.md` antes de ofrecer esas capacidades.

El script local rechaza archivos ZIP con symlinks, miembros duplicados, tamaños descomprimidos excesivos y rutas de escape, además de validar hashes de los archivos declarados.
