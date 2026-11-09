#!/usr/bin/env python3
"""Use only real screenshot assets with SHA256 provenance in the existing P2LRN website."""
from pathlib import Path
from html import escape
import json,hashlib,re

ROOT=Path(__file__).resolve().parent.parent
SITE=ROOT/'deploy/netlify/site'
ASSETS=SITE/'assets/studio-guide'
manifest=json.loads((ASSETS/'capture-manifest.json').read_text(encoding='utf-8'))
screens={item['name']:item for item in manifest['screens']}
for item in manifest['screens']:
    f=ASSETS/(item['name']+'.webp')
    if not f.is_file() or hashlib.sha256(f.read_bytes()).hexdigest()!=item['publicationSha256']:
        raise ValueError('Unverified screenshot: '+str(f))
for name in ['guide.css','guide.js','demo-tierra.webm','demo-tierra-poster.webp']:
    if not (ASSETS/name).is_file():raise ValueError('Missing '+name)

CONTENT={'es': {'hero': 'Crea cursos interactivos, cuestionarios y juegos 3D con P2LRN Studio',
        'shot': 'Captura real de Studio con un curso de geología abierto. Corresponde a una sesión local de '
                'desarrollo; la versión publicada puede variar.',
        'title': 'Conoce Studio: todos sus controles, con imágenes auténticas',
        'intro': 'Cada captura se ha recortado para enseñar exclusivamente el menú o la herramienta '
                 'correspondiente. Pulsa sobre ella para ampliarla.',
        'steps_title': 'Del editor al curso, explicado paso a paso',
        'steps': [('Abrir o crear',
                   'En Archivo elige Nuevo curso, Abrir .p2lrn o Recuperar borrador, según lo que necesites.'),
                  ('Organizar',
                   'Selecciona la unidad o lección en el árbol. Desde Insertar puedes añadir unidades, lecciones '
                   'y recursos.'),
                  ('Editar',
                   'Utiliza el lienzo y la barra Formato. Añadir contenido agrupa cuestionarios y juegos.'),
                  ('Comprobar', 'Abre Vista alumno y revisa el contenido sin dar por hecho que se ha guardado.'),
                  ('Guardar y exportar',
                   'Guarda el borrador o descarga el archivo .p2lrn desde el menú Archivo.')],
        'visual_doc': 'Guía ilustrada: para qué sirve cada botón y menú',
        'visual_intro': 'Los controles fueron inspeccionados en Chrome sobre Studio real, con el curso de la '
                        'Tierra abierto. No son recreaciones.',
        'games_title': 'Juegos 3D: controles que existen en Studio',
        'games_intro': 'Estas cuatro imágenes muestran únicamente los botones de selección de juegos 3D. No se '
                       'presentan como capturas de una partida funcional.',
        'games_warning': 'Edición 3D, interacción, corrección y puntuación pendientes de comprobar de extremo a '
                         'extremo en la última versión. No se sustituye una prueba por una imagen de menú.',
        'video_title': 'Demostración grabada del curso sobre la Tierra',
        'video_desc': 'Grabaci?n real de 25,8 segundos de actividades del curso de la Tierra realizada en una '
                      'sesi?n anterior de Studio; no muestra la creaci?n completa.',
        'video_details': 'Descripción accesible de la grabación',
        'video_transcript': 'Se recorre una actividad de las capas de la Tierra, otra de las capas de la '
                            'atm?sfera y la evaluaci?n final. No se demuestra una nota final.',
        'packages_title': 'Prueba otros formatos con Player auténtico',
        'packages_desc': 'Selecciona SCORM, H5P, QTI o cmi5. El selector consulta el catálogo oficial y abre una '
                         'sola instancia del visor existente cuando la solicites.',
        'packages_caution': 'Que el paquete figure en el catálogo no demuestra que funcione íntegramente: Player '
                            'mostrará cualquier error real de compatibilidad.',
        'open_real': 'Abrir en el visor independiente',
        'select_prompt': 'Selecciona un paquete para abrir el visor.',
        'zoom': 'Ampliar captura',
        'doc_link': 'Consultar la guía detallada',
        'games_link': 'Abrir documentación 3D',
        'studio_link': 'Abrir Studio',
        'home_title': 'Mira cómo funciona Studio',
        'home_text': 'Capturas auténticas de menús, botones, edición, juegos 3D y vídeo de un curso real.',
        'home_link': 'Explorar Studio y las demostraciones',
        'doc_warning': 'Estas imágenes corresponden a un entorno local de desarrollo, no son certificación de '
                       'producción.'},
 'en': {'hero': 'Create interactive courses, quizzes and 3D games with P2LRN Studio',
        'shot': 'Actual English Studio screenshot with a new course. Captured from Chrome in the development '
                'branch, not certified production.',
        'title': 'Explore Studio: every control explained with real images',
        'intro': 'Each image is a cropped capture of the English editor. English and Spanish Studio have '
                 'different controls, so their screenshots are never interchanged.',
        'steps_title': 'From the editor to a working course, step by step',
        'steps': [('Open or create', 'Use New course, Open file or Open URL above the editor.'),
                  ('Organize', 'Use New unit and New lesson; navigate the tree on the left.'),
                  ('Edit', 'Work in the lesson canvas; use the formatting ribbon and Add content dialog.'),
                  ('Review', 'Open Learner preview; this does not save or grade the lesson.'),
                  ('Save and export', 'Use Save draft or Export .p2lrn in the toolbar.')],
        'visual_doc': 'Illustrated guide to every button and menu',
        'visual_intro': 'Controls inspected in real English Studio with a new course ready to edit; this is not '
                        'the Spanish Earth science editor.',
        'games_title': '3D games: available Studio menu controls',
        'games_intro': 'The English dialog has 3D sorting, matching and classification. Assembly 3D is absent '
                       'from the inspected English interface. These are menu captures, not gameplay.',
        'games_warning': '3D interaction, correction and scoring remain unverified. Assembly 3D was not present '
                         'in the actual English menu.',
        'video_title': 'Recorded Earth science course demonstration',
        'video_desc': 'Real 25.8-second recording made in Spanish Studio, showing Earth science activities. '
                      'English scene descriptions are provided.',
        'video_details': 'Accessible recording description',
        'video_transcript': 'The Spanish-language recording navigates an Earth interior activity, an atmosphere '
                            'activity and a final assessment. It does not show complete course authoring or final '
                            'scoring.',
        'packages_title': 'Run other educational formats in the real Player',
        'packages_desc': 'Select SCORM, H5P, QTI or cmi5. The picker uses the official example catalog and loads '
                         'only one instance of the existing viewer on request.',
        'packages_caution': 'Catalog availability is not proof of complete browser support. Player will show any '
                            'actual compatibility error.',
        'open_real': 'Open in the independent viewer',
        'select_prompt': 'Choose a package to open the viewer.',
        'zoom': 'Zoom screenshot',
        'doc_link': 'Read the detailed Studio guide',
        'games_link': 'Open 3D documentation',
        'studio_link': 'Open Studio',
        'home_title': 'See Studio in action',
        'home_text': 'Real English-editor screenshots. The Earth science activity recording was made in Spanish '
                     'Studio and is labelled accordingly.',
        'home_link': 'Explore Studio screenshots and demos',
        'doc_warning': 'Screenshots document a local development build; they do not certify the production '
                       'version.'}}
MENU_CARDS={'es': [('menu-archivo',
         'Menú Archivo',
         'Nuevo curso, Abrir .p2lrn, Guardar borrador local, Recuperar borrador, Eliminar borrador, Descargar '
         '.p2lrn, Entrega offline, Revisar entrega y Abrir URL. Algunos requieren configuración o confirmación.'),
        ('acciones-superiores',
         'Guardar, Editar y Vista alumno',
         'Atajos para guardar, volver a editar y comprobar el curso en Player. La Vista alumno no sustituye el '
         'guardado.'),
        ('barra-formato',
         'Barra Formato',
         'Párrafo, fuente, tamaño, negrita, cursiva, subrayado, tachado, alineación, listas, deshacer, rehacer y '
         'colores. Usa el control adecuado sobre texto seleccionado.'),
        ('menu-insertar',
         'Barra Insertar',
         '+ Unidad, + Lección, Imagen, Vídeo, Añadir contenido, Sección, Dos columnas, Destacado, Tabla, Cuadro '
         'de texto, Formas, Desplegable, Arrastrar y soltar, Separador y Zonas de arrastre.'),
        ('selector-actividades',
         'Selector A?adir contenido',
         'Muestra las categor?as Contenido, Evaluaci?n y Juegos de la ventana aut?ntica del editor, sin afirmar '
         'que las actividades hayan sido completadas.'),
        ('arbol-lecciones',
         'Árbol de unidades y lecciones',
         'Selecciona el capítulo o actividad que quieres editar. El ejemplo contiene un curso real de geología y '
         'atmósfera.'),
        ('edicion-leccion',
         'Lienzo de edición',
         'Edición visual de la lección Núcleo interno. No es una maqueta de un curso vacío.'),
        ('vista-alumno',
         'Vista alumno',
         'Muestra el curso en el Player integrado; la imagen no certifica puntuación de todos los juegos.'),
        ('studio-movil',
         'Studio en móvil',
         'Vista auténtica a 390 píxeles. Revisa la disposición antes de publicar.')],
 'en': [('en-new-open',
         'New course and opening options',
         'The real New course, Open file and Open URL controls; there is no File dropdown in the inspected '
         'English UI.'),
        ('en-action-toolbar',
         'Main editing controls',
         'Real Edit, Learner preview, Add content, New unit and New lesson toolbar.'),
        ('en-format-toolbar',
         'Formatting ribbon',
         'The English paragraph, font, size, emphasis and alignment controls.'),
        ('en-add-content-dialog',
         'Add content picker',
         'Actual English menu for Content, Assessment, Games and Collaboration; not a completed activity.'),
        ('en-course-tree',
         'Course tree',
         'Actual New course, Unit 1 and First lesson shown in the English course outline.'),
        ('en-lesson-canvas', 'Lesson canvas', 'A blank First lesson ready to edit; not an Earth science lesson.'),
        ('en-save-export',
         'Saving and exporting',
         'The real Save draft, Export .p2lrn, Offline delivery and Review delivery buttons, without claiming '
         'certified output.'),
        ('en-learner-preview',
         'Learner preview',
         'Real learner preview of the example course, not evidence of scoring or completion.')]}
GAMES={'es': [('juego-3d-ordenar-menu', 'Ordenar 3D', 'Ordenar objetos en un espacio 3D.'),
        ('juego-3d-relacionar-menu', 'Relacionar 3D', 'Conectar objetos de una escena 3D.'),
        ('juego-3d-clasificar-menu', 'Clasificar 3D', 'Colocar objetos en categorías.'),
        ('juego-3d-ensamblar-menu', 'Ensamblaje 3D', 'Montar piezas y definir destinos geométricos.')],
 'en': [('en-3d-sort-menu', '3D sorting', 'Actual English 3D game (sort) menu item; gameplay unverified.'),
        ('en-3d-match-menu', '3D matching', 'Actual English 3D matching menu item; gameplay unverified.'),
        ('en-3d-classify-menu',
         '3D classification',
         'Actual English 3D classification menu item; gameplay unverified.')]}
SAMPLES={
'es':[('SCORM 1.2','Curso de varias lecciones','/examples/canonical/external/free/dog-maths-scorm12.p2lrn'),('H5P','Cuestionario de aritmética','/examples/canonical/external/free/h5p-arithmetic.p2lrn'),('QTI 2.2','Dos preguntas','/examples/canonical/external/free/qti22-two-questions.p2lrn'),('cmi5','Curso de geología','/examples/canonical/external/cmi5-catapult-pre-post.p2lrn')],
'en':[('SCORM 1.2','Multi-lesson course','/examples/canonical/external/free/dog-maths-scorm12.p2lrn'),('H5P','Arithmetic quiz','/examples/canonical/external/free/h5p-arithmetic.p2lrn'),('QTI 2.2','Two questions','/examples/canonical/external/free/qti22-two-questions.p2lrn'),('cmi5','Geology course','/examples/canonical/external/cmi5-catapult-pre-post.p2lrn')]}
def image(key,title,description,locale,priority=False,show_caption=True):
    asset=screens[key]
    u='/assets/studio-guide/'+key+'.webp'
    src=escape(description,quote=True)
    a=escape(CONTENT[locale]['zoom']+' - '+title,quote=True)
    return (f'<figure><a href="{u}" class="studio-guide-image-link" target="_blank" rel="noopener noreferrer" aria-label="{a}">'
            f'<img src="{u}" width="{asset["width"]}" height="{asset["height"]}" alt="{src}" '
            f'loading="{"eager" if priority else "lazy"}" decoding="async"></a>' +
            (f'<figcaption>{escape(title)}</figcaption>' if show_caption else '')+'</figure>')

def gallery(locale):
    out=['<div class="studio-guide-gallery">']
    for key,title,description in MENU_CARDS[locale]:
        out+=['<article class="studio-guide-card">',image(key,title,description,locale,show_caption=False),
              '<h3>'+escape(title)+'</h3><p>'+escape(description)+'</p></article>']
    return '\n'.join(out+['</div>'])

def games(locale):
    out=['<div class="studio-guide-3d-grid">']
    for key,title,description in GAMES[locale]:
        out+=['<article class="studio-guide-card"><span class="studio-guide-chip">STUDIO / MENU</span>',
              image(key,title,description,locale,show_caption=False),'<h3>'+escape(title)+'</h3><p>'+escape(description)+'</p></article>']
    return '\n'.join(out+['</div>'])

def large_guide(locale):
    d=CONTENT[locale]
    doc='/en/docs/studio/' if locale=='en' else '/docs/studio/'
    d3='/en/docs/3d-games/' if locale=='en' else '/docs/juegos-3d/'
    studio='/en/studio/' if locale=='en' else '/studio/'
    demo='/en/demo/' if locale=='en' else '/demo/'
    x=['<section class="studio-guide-section" id="guia-visual-studio" aria-labelledby="studio-visual-heading">',
       '<p class="studio-guide-eyebrow">STUDIO / VISUAL GUIDE</p>',
       '<h2 id="studio-visual-heading">'+escape(d['title'])+'</h2>',
       '<p>'+escape(d['intro'])+'</p>',
       '<div class="studio-guide-overview">',
       image('en-editor-real' if locale=='en' else 'editor-real',d['visual_intro'] if 'visual_intro' in d else d['title'],d['shot'],locale,True),
       '<div><p>'+escape(d['shot'])+'</p><ol class="studio-guide-quick-list">']
    x+=['<li>'+escape(t)+'</li>' for t,_ in d['steps']]
    x+=['</ol><p class="studio-guide-warning">'+escape(d['doc_warning'])+'</p>',
        f'<p><a href="{doc}">{escape(d["doc_link"])}</a></p></div></div></section>']
    x+=['<section class="studio-guide-section" id="studio-controles" aria-labelledby="studio-controles-heading">',
        '<p class="studio-guide-eyebrow">STUDIO / CONTROLS</p>',
        '<h2 id="studio-controles-heading">'+escape(d['visual_doc'])+'</h2>',
        '<p>'+escape(d['visual_intro'])+'</p>',gallery(locale),'</section>']
    x+=['<section class="studio-guide-section" id="studio-pasos" aria-labelledby="studio-pasos-heading">',
        '<h2 id="studio-pasos-heading">'+escape(d['steps_title'])+'</h2>',
        '<ol class="studio-guide-quick-list">']
    x+=['<li><strong>'+escape(title)+'</strong>: '+escape(desc)+'</li>' for title,desc in d['steps']]
    x+=['</ol><p><a href="'+studio+'">'+escape(d['studio_link'])+'</a></p></section>']
    x+=['<section class="studio-guide-section" id="studio-juegos-3d" aria-labelledby="studio-juegos-3d-heading">',
        '<p class="studio-guide-eyebrow">3D / STUDIO</p>',
        '<h2 id="studio-juegos-3d-heading">'+escape(d['games_title'])+'</h2>',
        '<p>'+escape(d['games_intro'])+'</p>',games(locale),
        '<p class="studio-guide-warning">'+escape(d['games_warning'])+'</p>',
        '<p><a href="'+d3+'">'+escape(d['games_link'])+'</a></p></section>']
    x+=['<section class="studio-guide-section" id="studio-video-real" aria-labelledby="studio-video-title">',
        '<h2 id="studio-video-title">'+escape(d['video_title'])+'</h2>',
        '<div class="studio-guide-video"><video controls playsinline preload="none" width="1560" height="940" '
        'poster="/assets/studio-guide/demo-tierra-poster.webp" '
        'aria-label="'+escape(d['video_title'],quote=True)+'">'
        '<source src="/assets/studio-guide/demo-tierra.webm" type="video/webm">' +
        '<track kind="captions" src="/assets/studio-guide/demo-tierra-'+locale+'.vtt" srclang="'+locale+'" label="Video scene descriptions" default></video>',
        '<p>'+escape(d['video_desc'])+'</p><details><summary>'+escape(d['video_details'])+'</summary>',
        '<p>'+escape(d['video_transcript'])+'</p></details></div></section>']
    x+=['<section class="studio-guide-section" id="studio-paquetes" data-studio-demo data-locale="'+locale+'" aria-labelledby="studio-paquetes-heading">',
        '<h2 id="studio-paquetes-heading">'+escape(d['packages_title'])+'</h2>',
        '<p>'+escape(d['packages_desc'])+'</p>',
        '<p class="studio-guide-warning">'+escape(d['packages_caution'])+'</p>',
        '<div class="studio-demo-choices">']
    for title,desc,url in SAMPLES[locale]:
        x+=['<div class="studio-guide-card"><button class="studio-demo-choice" type="button" aria-pressed="false" '
             'data-demo-url="'+url+'"><strong>'+escape(title)+'</strong><small>'+escape(desc)+'</small></button>',
             '<p><a href="'+demo+'?src='+url+'">'+escape(d['open_real'])+'</a></p></div>']
    x+=['</div><p role="status" aria-live="polite" data-demo-status>'+escape(d['select_prompt'])+'</p>',
        '<p data-demo-metadata></p><div class="studio-demo-stage" data-demo-stage></div></section>']
    return '\n'.join(x)

def mini_doc(locale):
    d=CONTENT[locale]
    return ('<section class="doc-section studio-guide-section" id="capturas-estudio" aria-labelledby="capturas-estudio-title">'
        '<p class="studio-guide-eyebrow">STUDIO / VISUAL</p><h2 id="capturas-estudio-title">'+escape(d['visual_doc'])+'</h2>'
        '<p>'+escape(d['visual_intro'])+'</p>'+gallery(locale)
        +'<p class="studio-guide-warning">'+escape(d['doc_warning'])+'</p></section>')

def mini_3d(locale):
    d=CONTENT[locale]
    return ('<section class="doc-section studio-guide-section" id="capturas-juegos-3d" aria-labelledby="capturas-juegos-3d-heading">'
        '<p class="studio-guide-eyebrow">3D / STUDIO</p><h2 id="capturas-juegos-3d-heading">'+escape(d['games_title'])+'</h2>'
        '<p>'+escape(d['games_intro'])+'</p>'+games(locale)
        +'<p class="studio-guide-warning">'+escape(d['games_warning'])+'</p></section>')

def styles(html,with_js=False):
    marker=re.search(r'<link\s+rel="stylesheet"\s+href="/p2lrn\.css(?:\?[^"]*)?"\s*/?>',html)
    if not marker: raise ValueError('Missing original website CSS link')
    css='<link rel="stylesheet" href="/assets/studio-guide/guide.css">'
    js='<script src="/assets/studio-guide/guide.js" defer></script>'
    if css not in html:html=html[:marker.end()]+css+html[marker.end():]
    if with_js and js not in html:html=html.replace('</head>',js+'</head>',1)
    return html

def change_landing(locale):
    rel=('en/' if locale=='en' else '')+'crear-cursos-interactivos/index.html'
    file=SITE/rel
    s=styles(file.read_text(encoding='utf-8'),True)
    a=s.find('<section class="studio-guide-section" id="guia-visual-studio"')
    if a>=0:
        b=s.index('<section class="landing-section" aria-labelledby="steps-heading">',a)
        s=s[:a]+s[b:]
    key='en-editor-real' if locale=='en' else 'editor-real'
    for name in ('/assets/hero/studio.png','/assets/studio-guide/editor-real.webp','/assets/studio-guide/en-editor-real.webp'):
        s=s.replace('src="'+name+'"','src="/assets/studio-guide/'+key+'.webp"',1)
    s=re.sub(r'(<img[^>]*src="/assets/studio-guide/'+re.escape(key)+r'\.webp")(?: width="\d+" height="\d+")?',
             lambda m:m[1]+' width="1408" height="'+('590' if locale=='en' else '852')+'"',s,count=1)
    s=re.sub(r'(<h1 id="landing-title">)(.*?)(</h1>)',
             lambda match:match[1]+escape(CONTENT[locale]['hero'])+match[3],s,count=1,flags=re.S)
    caption='Real Studio screenshot with an Earth science course open. Captured on a local development build; the deployed version may differ.' if locale=='en' else 'Captura real de Studio con un curso de geolog?a abierto. Corresponde a una sesi?n local de desarrollo; la versi?n publicada puede variar.'
    s=s.replace(caption,escape(CONTENT[locale]['shot']),1)
    # The landing hero and its caption must correspond to the screenshot actually rendered.
    if locale=='en':
        s=re.sub(r'(<figure class="landing-visual"><img[^>]*>)(<figcaption>)[^<]*(</figcaption>)',
                 lambda m:m[1]+m[2]+escape(CONTENT[locale]['shot'])+m[3],s,count=1)
    hero_description=('Real English Studio editor showing a new course and its first lesson, toolbar and lesson tree'
                      if locale=='en' else
                      'Studio espa?ol con el curso de la Tierra, ?rbol de lecciones y herramientas de edici?n')
    s=re.sub(r'(<figure class="landing-visual"><img[^>]*\balt=")[^"]*(")',
             lambda m:m[1]+escape(hero_description,quote=True)+m[2],s,count=1)
    marker='<section class="landing-section" aria-labelledby="steps-heading">'
    if marker not in s:raise ValueError('Missing steps marker')
    s=s.replace(marker,large_guide(locale)+'\n'+marker,1)
    file.write_text(s,encoding='utf-8')
    print('LANDING',rel,len(s))

def change_doc(locale,area):
    rel=('en/' if locale=='en' else '')+('docs/studio/index.html' if area=='studio' else 'docs/juegos-3d/index.html')
    file=SITE/rel
    s=styles(file.read_text(encoding='utf-8'))
    html=mini_doc(locale) if area=='studio' else mini_3d(locale)
    for sid in ('capturas-estudio','capturas-juegos-3d'):
        a=s.find('<section class="doc-section studio-guide-section" id="'+sid+'"')
        if a>=0:
            b=s.index('</section>',a)+len('</section>')
            s=s[:a-(1 if a>0 and s[a-1]=='\n' else 0)]+s[b:]
    start=s.index('<header class="doc-hero">')
    insert=s.index('</header>',start)+len('</header>')
    s=s[:insert]+'\n'+html+s[insert:]
    file.write_text(s,encoding='utf-8')
    print('DOC',rel,len(s))

def change_home(locale):
    rel=('en/' if locale=='en' else '')+'index.html'
    file=SITE/rel
    s=styles(file.read_text(encoding='utf-8'))
    a=s.find('<section class="studio-guide-section" id="homepage-studio-guide"')
    if a>=0:
        b=s.index('</section>',a)+len('</section>')
        s=s[:a]+s[b+(1 if s[b:b+1]=='\n' else 0):]
    # An old three-second animation only showed a loading state. Replace it
    # with the inspected real course walkthrough, not another mock video.
    key='en-editor-real' if locale=='en' else 'editor-real'
    for name in ('/assets/hero/studio.png','/assets/studio-guide/editor-real.webp','/assets/studio-guide/en-editor-real.webp'):
        s=s.replace('src="'+name+'"','src="/assets/studio-guide/'+key+'.webp"')
    s=re.sub(r'(<img src="/assets/studio-guide/'+re.escape(key)+r'\.webp")(?: width="\d+" height="\d+")?',
             lambda m:m[1]+' width="1408" height="'+('590' if locale=='en' else '852')+'"',s)
    if locale=='en':
        s=s.replace('alt="P2LRN Studio visual course editor interface"',
                    'alt="Real English Studio editing toolbar, blank first lesson and course tree"')
    s=s.replace('poster="/assets/hero/video-reference.jpg"','poster="/assets/studio-guide/demo-tierra-poster.webp"')
    s=s.replace('<source src="/assets/hero/preview.mp4" type="video/mp4">',
                '<source src="/assets/studio-guide/demo-tierra.webm" type="video/webm">')
    source='<source src="/assets/studio-guide/demo-tierra.webm" type="video/webm">'
    track='<track kind="captions" src="/assets/studio-guide/demo-tierra-'+locale+'.vtt" srclang="'+locale+'" label="Scene descriptions" default>'
    if source not in s:raise ValueError('Video source missing')
    if 'demo-tierra-'+locale+'.vtt' not in s:s=s.replace(source,source+track,1)
    s=s.replace('preload="metadata"','preload="none"')
    s=s.replace(' muted loop playsinline',' muted playsinline')
    s=s.replace(' muted="" loop="" playsinline=""',' muted="" playsinline=""')
    if locale=='es':
        s=s.replace('Paquete en movimiento','Recorrido del curso de la Tierra')
        s=s.replace('Verificar y reproducir','Actividades terrestres y evaluación')
        s=s.replace('Vista previa en v?deo de cursos interactivos P2LRN','Curso de la Tierra: actividades y evaluación en Studio')
    else:
        s=s.replace('Package in motion','Earth science course walkthrough')
        s=s.replace('Check and play','Earth layers, atmosphere and quiz')
        s=s.replace('P2LRN interactive course video preview','Earth science activities and quiz in P2LRN Studio')
    def correct_video_schema(match):
        data=json.loads(match.group(1))
        if data.get('@type')!='VideoObject':return match.group(0)
        data['name']=CONTENT[locale]['video_title']
        data['description']=CONTENT[locale]['video_transcript']
        data['thumbnailUrl']='https://p2lrn.org/assets/studio-guide/demo-tierra-poster.webp'
        data['contentUrl']='https://p2lrn.org/assets/studio-guide/demo-tierra.webm'
        data['duration']='PT25.8S'
        data['inLanguage']='es'
        return '<script type="application/ld+json">'+json.dumps(data,ensure_ascii=False,separators=(',',':'))+'</script>'
    s=re.sub(r'<script type="application/ld\+json">({[^<]*"@type":"VideoObject"[^<]*})</script>',
             correct_video_schema,s)
    if '/assets/hero/preview.mp4' in s or '/assets/hero/video-reference.jpg' in s:
        raise ValueError('Old loading animation still referenced in home')
    # Repair only historical textual mojibake created in this guide, never URLs.
    for before,after in {
        'atm?sfera':'atm\\u00f3sfera',
        'evaluaci?n':'evaluaci\\u00f3n',
        'espa?ol':'espa\\u00f1ol',
    }.items():
        s=s.replace(before,after)
    d=CONTENT[locale]
    landing='/en/crear-cursos-interactivos/' if locale=='en' else '/crear-cursos-interactivos/'
    fragment=('<section class="studio-guide-section" id="homepage-studio-guide" aria-labelledby="homepage-studio-guide-title">'
              '<div class="studio-guide-overview"><div><p class="studio-guide-eyebrow">P2LRN STUDIO</p>'
              '<h2 id="homepage-studio-guide-title">'+escape(d['home_title'])+'</h2>'
              '<p>'+escape(d['home_text'])+'</p><a class="button primary" href="'+landing+'">'+escape(d['home_link'])+'</a></div>'
              +image(key,d['home_title'],d['shot'],locale)+'</div></section>')
    pos=s.rfind('</main>')
    if pos<0:raise ValueError('Main not found')
    s=s[:pos]+fragment+'\n'+s[pos:]
    file.write_text("\n".join(line.rstrip(" \t") for line in s.split("\n")),encoding="utf-8")
    print('HOME',rel,len(s))

for locale in ['es','en']:
    change_landing(locale)
    change_doc(locale,'studio')
    change_doc(locale,'3d')
    change_home(locale)
print('BILINGUAL GUIDE UPDATED; original screenshot hashes verified.')
