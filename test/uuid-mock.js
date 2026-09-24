// CommonJS mock for the ESM-only `uuid` package (Jest default transform cannot parse it).
const crypto = require('crypto');

function v4() {
  return crypto.randomUUID();
}

module.exports = { v4, v1: v4, v3: v4, v5: v4 };
module.exports.default = module.exports;
