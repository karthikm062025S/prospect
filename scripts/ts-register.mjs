// Resolver hook so `node --experimental-strip-types` can run lib/*.ts directly:
// the lib uses extensionless relative imports (Next resolves them, raw node
// does not). Usage: node --experimental-strip-types --import ./scripts/ts-register.mjs <script.ts>
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
      if (existsSync(base + ext)) return next(specifier + ext, context);
    }
  }
  return next(specifier, context);
}
`),
  pathToFileURL("./"),
);
