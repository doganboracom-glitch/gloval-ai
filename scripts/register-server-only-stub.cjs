// Lets operator scripts run outside Next.js, where the `server-only` package
// does not exist. Use with: npx tsx --require ./scripts/register-server-only-stub.cjs <script>
const Module = require('node:module')
const originalResolve = Module._resolveFilename

Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return require.resolve('./empty-module.cjs')
  return originalResolve.call(this, request, ...rest)
}
