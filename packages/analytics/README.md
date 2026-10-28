# @p2lrn/analytics

Panel analítico embebible de P2LRN para alumnos, cursos, progreso, actividad, intentos y notas autoritativas.

## NPM

\`\`\`bash
npm install @p2lrn/analytics@0.5.0-alpha.11
\`\`\`

\`\`\`js
import '@p2lrn/analytics';
import {createHttpAnalyticsDataSource} from '@p2lrn/analytics';

const panel=document.querySelector('p2lrn-analytics');
panel.dataSource=createHttpAnalyticsDataSource({url:'/api/p2lrn/analytics/snapshot'});
await panel.refresh();
\`\`\`

## CDN

\`\`\`html
<script src="https://p2lrn.netlify.app/analytics/current/dist/p2lrn-analytics.js"></script>
<p2lrn-analytics src="/api/p2lrn/analytics/snapshot"></p2lrn-analytics>
\`\`\`

## Frontera de confianza

El paquete no guarda identidades ni historial del alumno dentro de \`.p2lrn\`. El Host entrega el dataset del panel. Una nota sólo se trata como oficial cuando \`grades[].authoritative === true\`. Los scores de navegador, progreso, actividad e intentos se muestran como evidencia separada.

Las señales de seguimiento son reglas transparentes de inactividad, progreso, nota e intentos; no son un modelo predictivo opaco.
