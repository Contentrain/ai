/* eslint-disable */
/* oxlint-disable */
// Auto-generated CJS proxy — delegates to ESM via dynamic import()
// The generated client is ESM-first. From CommonJS, await init() once before
// accessing exports:
//   const client = await require('#contentrain').init()
//   client.query('model')
// Prefer native ESM (import) where possible.
'use strict'
let _mod = null
let _promise = null

module.exports.init = function() {
  if (!_promise) _promise = import('./index.mjs').then(function(m) {
    _mod = m
    module.exports.query = m.query
    module.exports.singleton = m.singleton
    module.exports.dictionary = m.dictionary
    module.exports.document = m.document
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
  module.exports.document = m.document
  return module.exports
}).catch(function() { _promise = null; /* retry on next init() call */ })
