// `nodejs-dna` (DomainNameAPI's official SDK) ships no type declarations.
// The provider wrapper in `lib/custom-domains/registrar/domainnameapi-provider.ts`
// only touches a handful of loosely-typed response shapes, so an ambient
// `any`-module declaration is sufficient here rather than hand-authoring a
// full .d.ts for the whole SDK surface.
declare module 'nodejs-dna'

// The top-level `nodejs-dna` facade (`DomainNameApi.js`) unconditionally
// `require()`s both its REST and SOAP transports at module load time, and
// the SOAP transport unconditionally requires `strong-soap` -> `strong-globalize`
// -> `globalize` -> `cldr`. That chain is dead weight for REST-only usage
// (our reseller credentials are UUID-based, so REST is always the active
// transport) but a static `require('nodejs-dna')` still drags it into the
// Next.js/Vercel server bundle, which then fails to resolve `cldr`.
//
// `domainnameapi-provider.ts` therefore imports the REST client directly
// from this documented-but-unlisted-in-exports subpath, which has zero SOAP
// dependencies of its own (see node_modules/nodejs-dna/src/DNARest.js).
// This is still the SDK's own official REST implementation — only the
// SOAP-pulling facade layer above it is bypassed.
declare module 'nodejs-dna/src/DNARest'
