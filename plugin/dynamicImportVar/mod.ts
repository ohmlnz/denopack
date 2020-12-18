// deno-lint-ignore-file
import { path, Plugin } from "../../deps.ts";

import MagicString from "https://unpkg.com/magic-string@0.25.7/dist/magic-string.es.js?module";
import * as tree from "https://cdn.esm.sh/v14/estree-walker@2.0.2/esnext/estree-walker.js";
import * as acorn from "https://jspm.dev/acorn@8.0.4";

import { createFilter } from "../deps.ts";
import { dynamicImportToGlob, VariableDynamicImportError } from "./utils.ts";

type Opts = {
  include?: string | string[];
  exclude?: string | string[];
  warnOnError?: boolean;
};

export function pluginDynamicImportVariables(opts: Opts = {}): Plugin {
  const filter = createFilter(opts.include, opts.exclude);
  return {
    name: "denopack-plugin-dynamicImportVar",
    transform(code, id) {
      if (!filter(id)) {
        return "";
      }

      const parsed = acorn.parse(
        code,
        { ecmaVersion: "latest", sourceType: "module" },
      );

      let dynamicImportIndex = -1;
      let ms = {} as any;
      // @ts-ignore: Unreachable code error
      tree.walk(parsed, {
        enter: (node: any) => {
          if (node.type !== "ImportExpression") {
            return;
          }

          dynamicImportIndex += 1;

          try {
            // see if this is a variable dynamic import, and generate a glob expression
            const pattern = dynamicImportToGlob(
              node.source,
              code.substring(node.start, node.end),
            );

            if (!pattern) {
              // this was not a variable dynamic import
              return;
            }

            // execute the glob
            // @ts-ignore: Unreachable code error
            (async () => {
              // TODO: figure out how to obtain array below
              // @ts-ignore: Unreachable code error
              const paths = [
                "../../pages/FlagsPage/FlagsPage.jsx",
                "../../pages/QuestionsPage/QuestionsPage.jsx",
                "../../pages/RegistrationPage/RegistrationPage.jsx",
                "../../pages/InterstitialPage/InterstitialPage.jsx",
              ];

              //result.map((r) =>
              //r.startsWith("./") || r.startsWith("../") ? r : `./${r}`
              //);

              // create magic string if it wasn't created already
              // @ts-ignore: Unreachable code error
              ms = (Object.keys(ms).length > 0) ? ms : new MagicString(code);

              // unpack variable dynamic import into a function with import statements per file, rollup
              // will turn these into chunks automatically
              // @ts-ignore: Unreachable code error
              ms.prepend(
                `function __variableDynamicImportRuntime${dynamicImportIndex}__(path) {
                switch (path) {
                ${
                  // @ts-ignore: Unreachable code error
                  paths.map((p) => `   case '${p}': return import('${p}');`)
                    .join(
                      "\n  ",
                    )
                }
                  default: return Promise.reject(new Error("Unknown variable dynamic import: " + path));
                }
              }\n\n`,
              );
              // call the runtime function instead of doing a dynamic import, the import specifier will
              // be evaluated at runtime and the correct import will be returned by the injected function
              // @ts-ignore: Unreachable code error
              ms.overwrite(
                node.start,
                node.start + 6,
                `__variableDynamicImportRuntime${dynamicImportIndex}__`,
              );
            })();
          } catch (error) {
            if (error instanceof VariableDynamicImportError) {
              // TODO: line number
              if (opts.warnOnError) {
                this.warn(error);
              } else {
                this.error(error);
              }
            } else {
              this.error(error);
            }
          }
        },
      });

      if (dynamicImportIndex !== -1) {
        return {
          code: ms.toString(),
          map: ms.generateMap({
            file: id,
            includeContent: true,
            hires: true,
          }),
        };
      }

      return null;
    },
  };
}

export default pluginDynamicImportVariables;
export { dynamicImportToGlob, VariableDynamicImportError };
