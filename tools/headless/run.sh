#!/usr/bin/env bash
# The tile in a real GNOME Shell, headless, with two fake headsets.
#
#   tools/headless/run.sh          (LANG=fr_FR.UTF-8 tools/headless/run.sh for French)
#
# Everything is private to the run: HOME, XDG dirs, D-Bus session, and its
# own PipeWire (with no access to sound cards or Bluetooth). The real dconf,
# the real extensions and the real sound of the session are not touched, so
# it is safe to run while listening to something.
#
# Outputs in tools/headless/out: *.json (what the tile showed at each step),
# *.png (screenshots), shell.log.
set -u
S="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$S/../.." && pwd)"
T="$S/env"; OUT="$S/out"
UUID="listen-together@griffit.gmail.com"

rm -rf "$T" "$OUT"; RT=$(mktemp -d /tmp/ltg.XXXX)
mkdir -p "$T/config/wireplumber/wireplumber.conf.d" "$T/data/gnome-shell/extensions" "$OUT"
# The private WirePlumber must leave the real hardware alone.
cat > "$T/config/wireplumber/wireplumber.conf.d/no-hardware.conf" <<'CONF'
wireplumber.profiles = {
  main = {
    hardware.audio = disabled
    hardware.bluetooth = disabled
    hardware.video-capture = disabled
  }
}
CONF
"$REPO/pack.sh" >/dev/null
mkdir -p "$T/data/gnome-shell/extensions/$UUID"
unzip -q "$REPO/$UUID.shell-extension.zip" -d "$T/data/gnome-shell/extensions/$UUID"
glib-compile-schemas "$T/data/gnome-shell/extensions/$UUID/schemas"
cp -r "$S/probe@test" "$T/data/gnome-shell/extensions/"

env -u WAYLAND_DISPLAY -u DISPLAY -u DBUS_SESSION_BUS_ADDRESS \
  HOME="$T" XDG_CONFIG_HOME="$T/config" XDG_DATA_HOME="$T/data" XDG_CACHE_HOME="$RT/c" \
  XDG_RUNTIME_DIR="$RT" GSETTINGS_BACKEND=dconf PROBE_DIR="$OUT" \
  dbus-run-session -- "$S/inner.sh"
status=$?
rm -rf "$RT"
exit $status
