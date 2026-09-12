import {dispatchRuntimeEvent} from '../runtime-events.js';

export async function render({container, componentInstance, eventTarget, adapter, context}) {
  const data = componentInstance?.data ?? {};
  const section = document.createElement('section');
  section.className = 'p2lrn-component-timeline';
  const list = document.createElement('ol');
  list.className = 'p2lrn-component-timeline__list';
  for (const item of data.items ?? []) {
    const li = document.createElement('li');
    li.className = 'p2lrn-component-timeline__item';
    if (item.date) {
      const date = document.createElement('div');
      date.className = 'p2lrn-component-timeline__date';
      date.textContent = item.date;
      li.append(date);
    }
    const heading = document.createElement('h3');
    heading.textContent = item.title;
    li.append(heading);
    if (item.body) {
      const body = document.createElement('p');
      body.textContent = item.body;
      li.append(body);
    }
    list.append(li);
  }
  section.append(list);
  container.append(section);
  dispatchRuntimeEvent(eventTarget, 'p2lrn:activityready', {
    componentId: componentInstance.component.id,
    componentVersion: componentInstance.component.componentVersion,
    dataVersion: componentInstance.component.dataVersion,
  }, context, {adapter});
  return {destroy() { section.remove(); }};
}
