/**
 * Загрузчик ESM: подменяет WebGLRenderer заглушкой для тестов без GPU.
 * Используется только tools/boot-check.mjs (через module.register).
 */
export async function resolve(specifier, context, next) {
  if (specifier === 'three' && context.parentURL && context.parentURL.includes('/src/core/engine.js')) {
    return { url: new URL('./three-renderer-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}
