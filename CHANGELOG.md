# Changelog

## 0.4

Changes for the extensions.gnome.org review. No change to what the tile does.

- Moving a delay slider now runs `pw-cli` at most once every 150 ms (one
  pending timer, applying the latest value) instead of once per 10 ms step.
- Stopping sharing sends SIGTERM to `pipewire`, then SIGKILL after 2 s if it
  is still running. disable() leaves no timer behind.
- Shorter description in `metadata.json`, without the comparison with Apple's
  Share Audio (the non-affiliation notice stays).
- The GPL text is shipped in the zip; every source file has an SPDX header.
- Small code clean-ups (no empty `catch`, `GLib.Source.remove`, shorter
  comments).

## 0.3

Explicit cleanup for the review.

## 0.2

First version: share sound between Bluetooth headsets.
