import {NATIVE_QUESTIONNAIRE_MEDIA_TYPE, validateQuestionnaire} from '../questionnaire-core.js';
import {renderQuestionnaire} from '../questionnaire-runtime.js';
import {playerUiText} from './ui-i18n.js';

export const stylesheets = [new URL('../questionnaire.css', import.meta.url).href];

export async function render({container, bytes, representation, decodeJson, eventTarget, adapter, context}) {
  const media = String(representation.mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
  if (media !== NATIVE_QUESTIONNAIRE_MEDIA_TYPE) throw new Error(playerUiText('Tipo MIME no válido para cuestionario nativo: ')+representation.mediaType);
  const payload = decodeJson(bytes, 'native questionnaire');
  validateQuestionnaire(payload);
  return renderQuestionnaire(container, payload, {eventTarget, adapter, context});
}
