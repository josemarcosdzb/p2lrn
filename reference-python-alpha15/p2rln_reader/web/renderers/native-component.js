import {validateNativeComponent} from '../native-component-core.js';

export const stylesheets = [new URL('../component.css', import.meta.url).href];

function runtimeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export async function render(options) {
  const {container, bytes, decodeJson, componentRegistry, rendererRegistry, context = {}} = options;
  if (!componentRegistry || !rendererRegistry) throw runtimeError('P2RLN_COMPONENT_RUNTIME_UNAVAILABLE', 'Native component registries are not available in this host.');
  const source = validateNativeComponent(decodeJson(bytes, 'native component'));
  const prepared = await componentRegistry.prepare(source, context);
  const renderer = rendererRegistry.get(prepared.descriptor.rendererId);
  if (!renderer) throw runtimeError('P2RLN_COMPONENT_RENDERER_UNAVAILABLE', `Installed component ${prepared.descriptor.id} requires renderer ${prepared.descriptor.rendererId}, which is not installed.`);
  const candidate = {
    descriptor: renderer,
    representation: options.representation,
    entity: options.entity,
    resource: options.resource,
    selection: Object.freeze({source: 'component-registry', required: true}),
  };
  if (!(await rendererRegistry.supports(renderer, candidate))) {
    throw runtimeError('P2RLN_COMPONENT_RENDERER_UNAVAILABLE', `Component renderer ${renderer.id} cannot reproduce this component representation.`);
  }
  const nestedContext = Object.freeze({
    ...context,
    rendererId: renderer.id,
    componentId: prepared.descriptor.id,
    componentVersion: prepared.descriptor.componentVersion,
    dataVersion: prepared.dataVersion,
  });
  const module = await rendererRegistry.load(candidate, nestedContext);
  const runtime = await module.render({
    ...options,
    context: nestedContext,
    componentInstance: prepared.instance,
    componentDescriptor: prepared.descriptor,
    componentPreparation: prepared,
  });
  return runtime ?? {destroy() { container.replaceChildren(); }};
}
