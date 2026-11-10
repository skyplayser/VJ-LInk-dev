#!/bin/bash
# Signierte Prüfsummen für eine Veröffentlichung (R-16). Der private Schlüssel bleibt offline beim Entwickler.
#
# Einmalig Schlüssel erzeugen (nicht ins Repo!):
#   openssl genpkey -algorithm ed25519 -out ~/vjlink-release.key
#   openssl pkey -in ~/vjlink-release.key -pubout        # → Ausgabe als UPDATE_PUBLIC_KEY in src/core/update.ts
#
# Je Veröffentlichung, nach dem Bauen:
#   scripts/sign-release.sh ~/vjlink-release.key v0.1.3
# erzeugt release/SHA256SUMS und release/SHA256SUMS.sig und lädt beide zur Veröffentlichung hoch.
set -euo pipefail
KEY="${1:?Pfad zum privaten Schlüssel}"; TAG="${2:?Tag, z. B. v0.1.3}"
cd "$(dirname "$0")/../release"
shasum -a 256 VJ-Link-macos-arm64.dmg VJ-Link-macos-intel.dmg VJ-Link-windows.exe > SHA256SUMS
openssl pkeyutl -sign -rawin -inkey "$KEY" -in SHA256SUMS -out SHA256SUMS.sig
cat SHA256SUMS
gh release upload "$TAG" SHA256SUMS SHA256SUMS.sig --repo skyplayser/VJ-LINK --clobber
