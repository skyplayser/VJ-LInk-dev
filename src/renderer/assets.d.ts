// Bilder werden beim Bauen als Data-URL eingebettet (scripts/build.mjs).
declare module "*.png" { const url: string; export default url; }
