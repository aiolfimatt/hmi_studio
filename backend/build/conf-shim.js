// Build-time shim for the single-file bundle.
//
// In the bundle, every `require('.../config/conf.json')` is redirected here
// (see build/bundle.js) instead of inlining the JSON. That keeps the production
// config an EDITABLE sidecar file read at runtime — edits to config/conf.json on
// the deployed copy take effect on restart, exactly as with the unbundled app.
//
// `__HMI_BACKEND__` is injected by the bundler banner and equals the bundle's
// backend/ directory; the config folder is its sibling (../config).
const fs = require('fs');
const path = require('path');

const file = path.join(__HMI_BACKEND__, '..', 'config', 'conf.json');
module.exports = JSON.parse(fs.readFileSync(file, 'utf8'));
