/**
 * A minimal ESM resolve hook so Node can run the app's TypeScript directly.
 *
 * The application source uses extensionless imports ("./db") because that's
 * what the bundler expects, but Node's ESM resolver requires a full specifier.
 * Rather than littering the source with `.ts` extensions purely to satisfy a
 * test runner, this hook retries a failed resolution with `.ts` and `/index.ts`
 * appended, and maps the `@/` alias to the project root.
 *
 * Registered via: node --import ./scripts/resolve-ts.mjs
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

const ROOT = pathToFileURL(process.cwd() + "/").href;

export async function resolve(specifier, context, next) {
  // Project alias: "@/lib/db" → "<root>/lib/db"
  let spec = specifier;
  if (spec.startsWith("@/")) spec = new URL(spec.slice(2), ROOT).href;

  try {
    return await next(spec, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND" || /\.[cm]?[jt]sx?$/.test(spec)) throw err;

    for (const candidate of [`${spec}.ts`, `${spec}.tsx`, `${spec}/index.ts`]) {
      try {
        return await next(candidate, context);
      } catch {
        /* try the next candidate */
      }
    }
    throw err;
  }
}

register(import.meta.url, import.meta.url);
