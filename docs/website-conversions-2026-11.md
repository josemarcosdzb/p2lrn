# Conversión del sitio público P2LRN (noviembre de 2026)

## Recorrido
La portada ofrece tres opciones visibles desde el primer bloque: **Crear un curso en Studio**, **Probar Player con un curso real** y **Descargar Skills para IA**. Las páginas de cursos interactivos y cursos offline conservan accesos directos a Studio. La página de juegos 3D abre un curso real en Player. La página de Skills enlaza a las cuatro versiones y su manifiesto de integridad.

Studio abre automáticamente la primera lección editable o recupera el último borrador guardado localmente. «Nuevo curso», «Abrir archivo», «Abrir URL», «Guardar borrador», «Vista alumno» y «Exportar .p2lrn» continúan disponibles. Los cambios no guardados se confirman antes de iniciar otro curso.

## Eventos de conversión
La interfaz sólo registra eventos desde la web pública `p2lrn.org`, enviando un POST a `/.netlify/functions/p2lrn-conversion`:

| Evento | Qué demuestra | Qué no demuestra |
| --- | --- | --- |
| `landing_view` | Se ejecutó JavaScript en una página de entrada | Usuario único o visita contabilizada por Google |
| `link_studio` | Clic hacia Studio | Carga o edición satisfactoria |
| `studio_editor_ready` | Barra y editor realmente montados | Curso terminado o guardado |
| `link_player` | Clic hacia Player | Curso reproducido |
| `player_course_rendered` | El motor notificó un curso renderizado | Finalización del curso |
| `link_skills` | Clic hacia la página Skills | Instalación |
| `skill_download_clicked` | Clic en un ZIP; dimensión `destination` identifica ChatGPT/Claude/Gemini/Grok | Descarga completada o importación de Skill |
| `studio_package_exported` | Paquete verificado y exportación iniciada | Descarga finalizada en el dispositivo |

### Dimensiones admitidas
`event`, `page` (lista cerrada), `locale` (es/en), `destination` (lista cerrada), `channel` (direct/internal/google/external) y fecha del servidor. No se envían IDs, cookies, IP, nombres, URL completas de referencia, consultas de búsqueda ni contenido del curso. Google puede ocultar el referrer: `channel=direct` no significa necesariamente búsqueda directa.

Los eventos se encuentran en **Netlify → Cloud compute → Functions → p2lrn-conversion → Logs** filtrando `P2LRN_CONVERSION`. El endpoint no ofrece ningún listado público ni modifica datos de usuarios. Los logs están sujetos a límites de retención de Netlify; **no sustituyen un almacén histórico ni un panel de analítica**, y el evento se registra como intento si el navegador logra entregarlo. El conteo puede incluir bots o eventos repetidos de sesiones distintas.

## Método de evaluación
Combinar semanalmente los clics/impresiones/CTR de Google Search Console, el porcentaje de páginas indexadas y los conteos de eventos de Netlify. No calcular «conversión de usuarios de Google» dividiendo dos métricas de proveedores diferentes, porque no identifican la misma población.

1. Comprobar que los botones conducen a las rutas correctas y que las cuatro descargas responden con ZIP válido.
2. Probar Studio ES/EN en un perfil limpio: editor y primera lección visibles sin clic; crear texto, guardar borrador y recargar; verificar que se recupera la edición; cambiar a Vista alumno y exportar.
3. Probar Player ES/EN con curso real: esperar `p2lrn:rendered`.
4. Verificar HTTP del endpoint con un GET 405 y POST malformado 400 sin crear eventos falsos en producción. Los POST válidos se prueban sólo en tests locales o entornos de prueba para evitar inflar los datos reales.
5. Validar al publicar con las pruebas `node --test scripts/test-website-conversions.mjs`.

## Limitaciones y privacidad
La instrumentación es una primera etapa de conteo anónimo. No se promete atribución de cada usuario ni se almacenan identificadores de sesión. Si se quisiera medir usuarios únicos o embudos entre páginas de forma individual, haría falta diseño de consentimiento/privacidad y una solución analítica autorizada. Los registros de la infraestructura del proveedor pueden tener metadatos de red ajenos al cuerpo de evento; revisar la configuración legal y de retención antes de ampliar la recogida.
