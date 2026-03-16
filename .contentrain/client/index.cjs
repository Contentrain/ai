// Auto-generated CJS proxy — delegates to ESM via dynamic import()
// Sync usage: const client = require('#contentrain'); client.query('model')
// Async usage: const client = await require('#contentrain').init()
'use strict'
let _mod = null
let _promise = null

function _ensure() {
  if (_mod) return _mod
  throw new Error(
    'Contentrain client not initialized. Call .init() first, then access exports.\n'
    + 'Example: require("#contentrain").init().then(c => c.query("model"))'
  )
}

module.exports.init = function() {
  if (!_promise) _promise = import('./index.mjs').then(function(m) {
    _mod = m
    module.exports.query = m.query
    module.exports.singleton = m.singleton
    module.exports.dictionary = m.dictionary
    return module.exports
  })
  return _promise
}

// Eagerly start loading so subsequent sync calls work after first await
_promise = import('./index.mjs').then(function(m) {
  _mod = m
  module.exports.query = m.query
  module.exports.singleton = m.singleton
  module.exports.dictionary = m.dictionary
  return module.exports
}).catch(function() { _promise = null; /* retry on next init() call */ })
