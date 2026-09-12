import {CompositeRuntime} from '../composite-runtime.js';

export const stylesheets = [new URL('../composite.css', import.meta.url).href];

export async function render({container, bytes, entity, package: pkg, decodeJson, eventTarget, adapter, context, renderActivity}) {
  const payload = decodeJson(bytes, 'native composite');
  const runtime = new CompositeRuntime(payload, {container, entity, package: pkg, renderActivity, eventTarget, adapter, context});
  await runtime.mount();
  return runtime;
}
