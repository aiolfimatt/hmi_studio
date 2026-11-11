// ===========================================================================
// HMI Studio - backend bundler.
//
// Packs the backend (index.js + all of src/ + every production dependency) into
// ONE self-contained CommonJS file: backend/server.js. The portable package can
// then ship that single file instead of the ~1,500-file node_modules tree; the
// production PC runs `node server.js` with nothing installed but node.exe.
//
//   node build/bundle.js
//
// Two concerns are handled here (not by editing source), so the unbundled dev
// workflow — `npm run dev` / `node index.js` — is completely unchanged:
//
//  1. __dirname/__filename: our modules resolve the data/, frontend/dist and
//     config/ sidecar folders relative to their OWN file location. A single
//     bundled file collapses every __dirname to one directory, which would break
//     those relative paths differently per module. We rewrite each source
//     module's __dirname to be anchored at the real backend/ dir plus that
//     module's ORIGINAL sub-path, so the maths still lands on the same folders.
//
//  2. config/conf.json: it must stay an editable runtime file on the deployed
//     copy (credentials, PLC/DB endpoints). We redirect its require to a shim
//     (build/conf-shim.js) that fs-reads it at runtime instead of inlining it.
// ===========================================================================
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const BACKEND = path.resolve(__dirname, '..'); // backend/
const ENTRY = path.join(BACKEND, 'index.js');
const OUT = path.join(BACKEND, 'server.js');
const SHIM = path.join(__dirname, 'conf-shim.js');

const hmiPaths = {
  name: 'hmi-paths',
  setup(build) {
    // Keep config/conf.json an editable runtime file (do NOT inline the JSON).
    build.onResolve({ filter: /config[\\/]conf\.json$/ }, () => ({ path: SHIM }));

    // Rewrite __dirname/__filename in OUR source (never in node_modules) so each
    // bundled module resolves the same sidecar folders it did when unbundled.
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      if (args.path.split(path.sep).includes('node_modules')) return null;
      let code = await fs.promises.readFile(args.path, 'utf8');
      if (!/\b__dirname\b|\b__filename\b/.test(code)) return null;

      const relDir = path
        .relative(BACKEND, path.dirname(args.path))
        .split(path.sep)
        .join('/');
      const base = relDir
        ? `require('path').join(__HMI_BACKEND__, ${JSON.stringify(relDir)})`
        : '__HMI_BACKEND__';

      code = code
        .replace(/\b__dirname\b/g, base)
        .replace(
          /\b__filename\b/g,
          `require('path').join(${base}, ${JSON.stringify(path.basename(args.path))})`
        );
      return { contents: code, loader: 'js' };
    });
  },
};

esbuild
  .build({
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    minify: false,
    legalComments: 'none',
    // __HMI_BACKEND__ == the bundle's own directory (backend/) at runtime; Node
    // provides the real __dirname for this CommonJS output file.
    banner: { js: 'var __HMI_BACKEND__ = __dirname;' },
    // Optional native/peer deps that ws, pg and node-opcua require()/import()
    // inside try/catch; they are not installed and degrade gracefully at runtime.
    // Keeping them external just silences unresolved-import warnings/errors.
    // proper-lockfile is an optional peer dep of @ster5/global-mutex (node-opcua's
    // PKI file lock), loaded via a dynamic import that stays unresolved here.
    external: ['bufferutil', 'utf-8-validate', 'pg-native', 'proper-lockfile'],
    plugins: [hmiPaths],
    logLevel: 'info',
  })
  .then(() => {
    const kb = Math.round(fs.statSync(OUT).size / 1024);
    console.log(`Bundled -> ${OUT} (${kb} KB)`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
