#!/usr/bin/env bash
# Builds listen-together@griffit.gmail.com.shell-extension.zip in the repo root.
# Install it with: gnome-extensions install --force <zip>
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$REPO/extension"
DOMAIN="listen-together"

# Keep the source tree's .mo files current, for runs straight from a checkout.
for po in "$SRC"/po/*.po; do
    lang="$(basename "$po" .po)"
    dest="$SRC/locale/$lang/LC_MESSAGES"
    mkdir -p "$dest"
    msgfmt --check "$po" -o "$dest/$DOMAIN.mo"
done

gnome-extensions pack "$SRC" \
  --extra-source=model.js \
  --extra-source=sharing.js \
  --extra-source=combine.conf \
  --schema=schemas/org.gnome.shell.extensions.listen-together.gschema.xml \
  --podir=po \
  --gettext-domain="$DOMAIN" \
  --out-dir="$REPO" \
  --force

echo "Built: $REPO/listen-together@griffit.gmail.com.shell-extension.zip"
