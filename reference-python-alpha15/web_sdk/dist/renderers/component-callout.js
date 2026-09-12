import {dispatchRuntimeEvent} from '../runtime-events.js';

export async function render({container, componentInstance, eventTarget, adapter, context}) {
  const data = componentInstance?.data ?? {};
  const article = document.createElement('article');
  article.className = `p2rln-component-callout tone-${data.tone ?? 'info'}`;
  if (data.heading) {
    const heading = document.createElement('h3');
    heading.textContent = data.heading;
    article.append(heading);
  }
  const body = document.createElement('p');
  body.textContent = data.body;
  article.append(body);
  container.append(article);
  dispatchRuntimeEvent(eventTarget, 'p2rln:activityready', {
    componentId: componentInstance.component.id,
    componentVersion: componentInstance.component.componentVersion,
    dataVersion: componentInstance.component.dataVersion,
  }, context, {adapter});
  return {destroy() { article.remove(); }};
}
