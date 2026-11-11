#!/usr/bin/env bash
# Runs every test: tests/run.sh
# The engine test talks to the running PipeWire: it adds two silent fake
# headsets and switches the default output for a few seconds.
set -u
cd "$(dirname "$0")/.."
status=0
echo "== model (pure rules)"
gjs -m tests/model.test.js || status=1
echo "== engine (real PipeWire, fake headsets)"
# Gvc is GNOME Shell's private mixer library.
GI_TYPELIB_PATH=/usr/lib/gnome-shell LD_LIBRARY_PATH=/usr/lib/gnome-shell \
    gjs -m tests/sharing.test.js || status=1
exit $status
