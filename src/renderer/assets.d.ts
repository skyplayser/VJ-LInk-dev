// Bilder werden beim Bauen als Data-URL eingebettet (scripts/build.mjs).
declare module "*.png" { const url: string; export default url; }
/** Versionsnummer aus package.json (scripts/build.mjs setzt sie ein). */
declare const APP_VERSION: string;
