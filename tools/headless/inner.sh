#!/usr/bin/env bash
# Runs inside the private D-Bus session set up by run.sh.
set -u
S="$(cd "$(dirname "$0")" && pwd)"; T="$S/env"; OUT="$S/out"
UUID="listen-together@griffit.gmail.com"
A="bluez_output.FA_KE_00_00_00_01.1"; B="bluez_output.FA_KE_00_00_00_02.1"
failed=0
# NAME_A / NAME_B: what the two fake headsets are called (for screenshots).
NAME_A="${NAME_A:-Casque de Camille}"; NAME_B="${NAME_B:-Casque de Julien}"
# SCALE=2: a HiDPI screen, for sharper screenshots.
SCALE="${SCALE:-1}"

probe() {   # probe <command...>: hand one command to probe@test, wait for it
    echo "$*" > "$OUT/cmd"
    for _ in $(seq 100); do [ -e "$OUT/cmd" ] || return 0; sleep 0.05; done
    echo "probe did not take: $*" >&2; failed=1
}
field() {   # field <state> <jq-less key>: value of a key in out/<state>.json
    python3 -c "import json,sys; print(json.dumps(json.load(open(sys.argv[1]))[sys.argv[2]], ensure_ascii=False))" "$OUT/$1.json" "$2"
}
expect() {  # expect <label> <got> <want>
    if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1 (got $2, want $3)"; failed=1; fi
}
default_sink() { wpctl inspect @DEFAULT_AUDIO_SINK@ 2>/dev/null | sed -n 's/.*node.name = "\(.*\)"/\1/p' | head -1; }
add_fake() {
    pw-cli create-node adapter "{ factory.name=support.null-audio-sink node.name=\"$1\" node.description=\"$2\" media.class=Audio/Sink audio.position=[FL FR] object.linger=true }" >/dev/null
}
cleanup() { kill "${PP:-}" "${WP:-}" "${PW:-}" 2>/dev/null; }
trap cleanup EXIT

# A private PipeWire in the private runtime dir, with a fake laptop speaker.
SPK="alsa_output.fake-speaker"
pipewire > "$OUT/pipewire.log" 2>&1 & PW=$!
sleep 0.7
wireplumber > "$OUT/wireplumber.log" 2>&1 & WP=$!
pipewire-pulse > "$OUT/pipewire-pulse.log" 2>&1 & PP=$!
sleep 1.5
if [ "$(pw-cli info 0 2>/dev/null | grep -c "$XDG_RUNTIME_DIR")" = 0 ] && ! [ -S "$XDG_RUNTIME_DIR/pipewire-0" ]; then
    echo "FAIL the private PipeWire did not start" >&2; exit 1
fi
if [ "$(pw-cli ls Device 2>/dev/null | grep -c -E "alsa|bluez")" != 0 ]; then
    echo "FAIL the private PipeWire sees real hardware; stopping before touching it" >&2; exit 1
fi
add_fake "$SPK" "Laptop speaker"; sleep 0.5
wpctl set-default "$(pw-cli ls Node | grep -B8 "node.name = \"$SPK\"" | sed -n 's/^\s*id \([0-9]*\),.*/\1/p' | tail -1)"

gsettings set org.gnome.shell disable-user-extensions false
gsettings set org.gnome.desktop.interface color-scheme prefer-dark
[ "$SCALE" = 1 ] || gsettings set org.gnome.desktop.interface scaling-factor "$SCALE"
gnome-shell --headless --wayland --no-x11 --virtual-monitor "$((1280 * SCALE))x$((800 * SCALE))" --wayland-display=wayland-ltg > "$OUT/shell.log" 2>&1 &
SH=$!
sleep 6
gnome-extensions enable "$UUID"
gnome-extensions enable probe@test
sleep 1.5
INITIAL="$(default_sink)"
echo "# default output before: $INITIAL"

probe state s0
expect "tile exists" "$(field s0 found)" true
expect "tile hidden without headsets" "$(field s0 visible)" false

add_fake "$A" "$NAME_A"; sleep 1
probe state s1
expect "tile hidden with one headset" "$(field s1 visible)" false

add_fake "$B" "$NAME_B"; sleep 1
probe open; sleep 1
probe state s2
expect "tile shown with two headsets" "$(field s2 visible)" true
expect "tile drawn in the menu" "$(field s2 mapped)" true
expect "tile off" "$(field s2 checked)" false
expect "two sliders" "$(field s2 devices)" "[\"$NAME_A\", \"$NAME_B\"]"
# Counted just before the click: system icons (Bluetooth…) come and go.
ICONS="$(field s2 panelIcons)"
probe shot 1-tile; sleep 1

probe click; sleep 2
probe state s3
expect "tile on after a click" "$(field s3 checked)" true
expect "shared output is the default" "$(default_sink)" "listen_together"
expect "no icon added to the top bar" "$(field s3 panelIcons)" "$ICONS"
echo "# subtitle: $(field s3 subtitle)"
probe shot 2-active; sleep 1

probe menu; sleep 1
probe volume 0 0.3; sleep 0.7
probe state s4
expect "slider moved" "$(field s4 sliders)" '[0.3, 1]'
expect "headset volume follows its slider" "$(wpctl get-volume "$(pw-cli ls Node | grep -B8 "node.name = \"$A\"" | sed -n 's/^\s*id \([0-9]*\),.*/\1/p' | tail -1)" 2>/dev/null)" "Volume: 0.30"
probe delay 1 120; sleep 0.7
probe state s4b
expect "delay shown" "$(field s4b delays)" '["0 ms", "120 ms"]'
expect "delay remembered" "$(gsettings --schemadir "$T/data/gnome-shell/extensions/$UUID/schemas" get org.gnome.shell.extensions.listen-together delays)" "{'$B': 120}"
probe shot 3-menu; sleep 1

probe click; sleep 1.5
probe state s5
expect "tile off after a second click" "$(field s5 checked)" false
expect "previous output restored" "$(default_sink)" "$INITIAL"

probe click; sleep 2
expect "on again" "$(default_sink)" "listen_together"
pw-cli destroy "$B" >/dev/null; sleep 1.5
probe state s6
expect "tile hidden when a headset leaves" "$(field s6 visible)" false
expect "sharing stopped" "$(field s6 checked)" false
expect "previous output restored after the loss" "$(default_sink)" "$INITIAL"

# Turning the extension off while sharing must clean up after itself.
add_fake "$B" "$NAME_B"; sleep 1
probe click; sleep 2
expect "on a third time" "$(default_sink)" "listen_together"
gnome-extensions disable "$UUID"; sleep 1.5
expect "disable restores the output" "$(default_sink)" "$INITIAL"
expect "disable removes the shared output" "$(pw-cli ls Node | grep -c 'node.name = "listen_together"')" 0

[ -e "$OUT/error" ] && { echo "FAIL probe errors:"; cat "$OUT/error"; failed=1; }
kill $SH; wait $SH 2>/dev/null
echo "=== shell.log (extension lines)"
grep -i -E "listen-together|JS ERROR|probe" "$OUT/shell.log" | tail -20
echo "# default output after: $(default_sink)"
exit $failed
