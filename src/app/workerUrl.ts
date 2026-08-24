// The engine worker's URL, in the one form real module environments give us:
// `new URL(..., import.meta.url)`. This module exists SEPARATELY (and is never statically
// imported) because immediately.run transpiles app source ESM→CommonJS and evaluates it as a
// classic script — where `import.meta` is a *parse-time* SyntaxError that would kill any
// module containing it. Reached only through a dynamic `import()` inside `makeTransport`'s
// try/catch, the failure is catchable and the in-process transport takes over there.
export const ENGINE_WORKER_URL = new URL('../entry/engine.ts', import.meta.url);
