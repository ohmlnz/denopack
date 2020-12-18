import { fs, path, Plugin } from "../../deps.ts";
import { createFilter } from "../deps.ts";
import { default as nodeSass } from "https://cdn.skypack.dev/pin/node-sass@v5.0.0-FtFd50hk5QgZfrZX40hW/node-sass.js";

type Opts = {
  output?: boolean | string | ((styles: string, styleNodes: string) => any);
  include?: string[];
  exclude?: string[];
  failOnError?: boolean;
  prefix?: string;
  includePaths?: any;
  processor?: any;
  watch?: string | string[];
  sass?: any;
};

export function pluginSassLoader(opts: Opts = {}): Plugin {
  const filter = createFilter(
    opts.include || ["/**/*.css", "/**/*.scss", "/**/*.sass"],
    opts.exclude,
  );
  let dest = opts.output;

  const styles = {};
  const prefix = opts.prefix ? opts.prefix + "\n" : "";
  let includePaths = opts.includePaths || ["node_modules/"];
  includePaths.push(Deno.cwd());

  const compileToCSS = function (scss: any) {
    // Compile SASS to CSS
    if (scss.length) {
      includePaths = includePaths.filter((v: any, i: any, a: any) =>
        a.indexOf(v) === i
      );
      try {
        const sass = opts.sass || nodeSass;
        const css = sass.renderSync(Object.assign({
          data: prefix + scss,
          includePaths,
        }, opts)).css.toString();
        // Possibly process CSS (e.g. by PostCSS)
        if (typeof opts.processor === "function") {
          const processor = opts.processor(css, styles);

          // PostCSS support
          if (typeof processor.process === "function") {
            return Promise.resolve(processor.process(css, { from: undefined }))
              .then((result) => result.css);
          }

          return processor;
        }
        return css;
      } catch (e) {
        if (opts.failOnError) {
          throw e;
        }
        console.log();
        console.log(red("Error:\n\t" + e.message));
        if (e.message.includes("Invalid CSS")) {
          console.log(green("Solution:\n\t" + "fix your Sass code"));
          console.log("Line:   " + e.line);
          console.log("Column: " + e.column);
        }
        if (
          e.message.includes("node-sass") && e.message.includes("find module")
        ) {
          console.log(green("Solution:\n\t" + "npm install --save node-sass"));
        }
        if (e.message.includes("node-sass") && e.message.includes("bindings")) {
          console.log(green("Solution:\n\t" + "npm rebuild node-sass --force"));
        }
        console.log();
      }
    }
  };

  return {
    name: "denopack-plugin-sassLoader",
    transform(code, id) {
      if (!filter(id)) {
        return;
      }

      // Add the include path before doing any processing
      includePaths.push(path.dirname(id));

      // Rebuild all scss files if anything happens to this folder
      // TODO: check if it's possible to get a list of all dependent scss files
      //       and only watch those
      if ("watch" in opts) {
        const files = Array.isArray(opts.watch) ? opts.watch : [opts.watch];
        // @ts-ignore: Unreachable code error
        files.forEach((file) => this.addWatchFile(file));
      }

      // When output is disabled, the stylesheet is exported as a string
      if (opts.output === false) {
        return Promise.resolve(compileToCSS(code)).then((css) => ({
          code: "export default " + JSON.stringify(css),
          map: { mappings: "" },
        }));
      }

      // Map of every stylesheet
      // @ts-ignore: Unreachable code error
      styles[id] = code;

      return "";
    },
    generateBundle(opts: any) {
      // No stylesheet needed
      if (opts.output === false) {
        return;
      }

      // Combine all stylesheets
      let scss = "";
      for (const id in styles) {
        // @ts-ignore: Unreachable code error
        scss += styles[id] || "";
      }

      const css = compileToCSS(scss);

      // Resolve if processor returned a Promise
      Promise.resolve(css).then(
        (async (css) => {
          // Emit styles through callback
          if (typeof opts.output === "function") {
            opts.output(css, styles);
            return;
          }

          if (typeof css !== "string") {
            return;
          }

          if (typeof dest !== "string") {
            // Don't create unwanted empty stylesheets
            if (!css.length) {
              return;
            }

            // Guess destination filename
            dest = opts.dest || opts.file || "bundle.js";
            dest = dest?.toString();
            if (dest?.endsWith(".js")) {
              dest = dest?.slice(0, -3);
            }
            dest = dest + ".css";
          }

          // Ensure that dest parent folders exist (create the missing ones)
          ensureParentDirsSync(path.dirname(dest));

          // Emit styles to file
          try {
            await Deno.writeTextFile(dest, css);
          } catch (err) {
            if (opts.verbose !== false) {
              if (err) {
                console.error(red(err));
              } else if (css && typeof dest === "string") {
                console.log(green(dest), getSize(css.length));
              }
            }
          }
        }),
      );
    },
  };
}

function red(text: string) {
  return "\x1b[1m\x1b[31m" + text + "\x1b[0m";
}

function green(text: string) {
  return "\x1b[1m\x1b[32m" + text + "\x1b[0m";
}

function getSize(bytes: number) {
  return bytes < 10000
    ? bytes.toFixed(0) + " B"
    : bytes < 1024000
    ? (bytes / 1024).toPrecision(3) + " kB"
    : (bytes / 1024 / 1024).toPrecision(4) + " MB";
}

function ensureParentDirsSync(dir: string) {
  if (fs.existsSync(dir)) {
    return;
  }

  try {
    Deno.mkdirSync(dir);
  } catch (err) {
    if (err.code === "ENOENT") {
      ensureParentDirsSync(path.dirname(dir));
      ensureParentDirsSync(dir);
    }
  }
}

export default pluginSassLoader;
