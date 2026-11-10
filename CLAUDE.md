# VJ-Link – Hinweise für die Arbeit am Code

- Herkunft prüfen: For distinctive algorithms, shaders, protocol code or unusual constants, check the origin before committing (GitHub code search for the constants); copy only with a matching license and credit (THIRD_PARTY.md, „Shader credits“). Keine bekannten Shadertoy-Shader nachbauen.
- Neue Laufzeit-Abhängigkeiten brauchen einen Lizenztext; `npm run build` bricht sonst ab (THIRD_PARTY_LICENSES.txt).
- Logo und App-Icon: `scripts/logo/make_svgs.py` (Schrift Inter Display, OFL) und `scripts/logo/render.cjs`, keine Systemschriften.
