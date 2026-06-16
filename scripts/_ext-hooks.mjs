// Resolve hook: lets Node load Vite-style extensionless relative imports
// (e.g. `import ... from "./excel"`) by retrying with a ".js" suffix.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      return next(specifier + ".js", context);
    }
    throw err;
  }
}
