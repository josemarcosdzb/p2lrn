import {playerUiText} from './ui-i18n.js';
import {FILL_BLANKS_RENDERER} from '../renderer-registry.js';
import {NATIVE_QUESTIONNAIRE_MEDIA_TYPE, validateQuestionnaire} from '../questionnaire-core.js';
import {renderQuestionnaire} from '../questionnaire-runtime.js';
export const stylesheets=[new URL('../questionnaire.css',import.meta.url).href];
export async function render({container,bytes,representation,decodeJson,eventTarget,adapter,context}){
  const media=String(representation.mediaType??'').split(';',1)[0].trim().toLowerCase();
  if(media!==NATIVE_QUESTIONNAIRE_MEDIA_TYPE)throw new Error(playerUiText('Tipo MIME no válido para ')+FILL_BLANKS_RENDERER+': '+representation.mediaType);
  const payload=decodeJson(bytes,'fill blanks game');validateQuestionnaire(payload);
  if(payload.questions.some((q)=>q.type!=='fill-blanks'))throw new Error(playerUiText('El juego Rellenar huecos sólo admite preguntas fill-blanks.'));
  return renderQuestionnaire(container,payload,{eventTarget,adapter,context});
}
