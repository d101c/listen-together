// The engine behind the tile. It has no GNOME Shell import (only Gio/GLib
// and a Gvc.MixerControl handed in), so tests can drive it from plain gjs.
//
// Sharing on  = a `pipewire -c combine.conf` child process is alive; it adds
//               the virtual output, which becomes the default output.
// Sharing off = the process is stopped (the output disappears with it) and
//               the output that was the default before is the default again.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {SINK_NAME, isBluetoothSink, latencyOffsets} from './model.js';

const SIGTERM = 15;
// The virtual output shows up well under a second after the process starts.
const START_TIMEOUT_MS = 5000;

export class Sharing {
    // onChanged() is called whenever `available`, `active` or `devices` may
    // have changed.
    constructor(control, confPath, onChanged = () => {}) {
        this._control = control;
        this._confPath = confPath;
        this._onChanged = onChanged;
        this._program = GLib.find_program_in_path('pipewire');
        this._pwCli = GLib.find_program_in_path('pw-cli');
        this._delays = {};
        // Latency offsets currently set on the devices: {name: nanoseconds}.
        this._offsets = {};
        this._proc = null;
        this._switched = false;
        this._previous = null;
        this._startTimeout = 0;
        this._signals = [
            control.connect('state-changed', () => this._sync()),
            control.connect('stream-added', (_c, id) => this._streamAdded(id)),
            control.connect('stream-removed', () => this._sync()),
            control.connect('default-sink-changed', (_c, id) => this._defaultChanged(id)),
        ];
    }

    // The connected Bluetooth outputs, as Gvc.MixerStream objects.
    get devices() {
        return this._control.get_sinks().filter(s => isBluetoothSink(s.get_name()));
    }

    get available() {
        return this._program !== null && this.devices.length >= 2;
    }

    get active() {
        return this._proc !== null;
    }

    // delays: {output name: milliseconds}. Applied at once when sharing is on.
    setDelays(delays) {
        this._delays = {...delays};
        if (this.active && this._switched)
            this._applyOffsets();
    }

    start() {
        if (this.active || !this.available)
            return;
        this._previous = this._control.get_default_sink()?.get_name() ?? null;
        this._switched = false;
        let proc;
        try {
            proc = Gio.Subprocess.new(
                [this._program, '-c', this._confPath],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            console.error(`listen-together: cannot start pipewire: ${e.message}`);
            return;
        }
        this._proc = proc;
        proc.wait_async(null, (p, res) => {
            try {
                p.wait_finish(res);
            } catch (_e) {
                // Nothing to do: the process is gone either way.
            }
            // Only when it died on its own; stop() has already let go of it.
            if (this._proc === p)
                this._stopped(true);
        });
        this._startTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, START_TIMEOUT_MS, () => {
            this._startTimeout = 0;
            if (this.active && !this._switched) {
                console.error('listen-together: the shared output did not appear');
                this.stop();
            }
            return GLib.SOURCE_REMOVE;
        });
        // A leftover output from an earlier process would not raise
        // stream-added again.
        const existing = this._findSink(SINK_NAME);
        if (existing)
            this._switchTo(existing);
        this._onChanged();
    }

    // restore=false leaves the default output alone: the user has just picked
    // another one themselves.
    stop(restore = true) {
        if (!this.active)
            return;
        const proc = this._proc;
        this._proc = null;
        proc.send_signal(SIGTERM);
        this._stopped(restore);
    }

    destroy() {
        this.stop();
        for (const id of this._signals)
            this._control.disconnect(id);
        this._signals = [];
        this._onChanged = () => {};
    }

    _stopped(restore) {
        this._proc = null;
        if (this._startTimeout) {
            GLib.source_remove(this._startTimeout);
            this._startTimeout = 0;
        }
        const previous = this._previous;
        const switched = this._switched;
        this._previous = null;
        this._switched = false;
        this._clearOffsets();
        if (restore && switched && previous) {
            const sink = this._findSink(previous);
            if (sink)
                this._control.set_default_sink(sink);
        }
        this._onChanged();
    }

    _findSink(name) {
        return this._control.get_sinks().find(s => s.get_name() === name) ?? null;
    }

    _switchTo(sink) {
        this._switched = true;
        this._control.set_default_sink(sink);
        this._applyOffsets();
    }

    _setOffset(name, nsec) {
        if (!this._pwCli)
            return;
        try {
            Gio.Subprocess.new(
                [this._pwCli, 'set-param', name, 'Props', `{ latencyOffsetNsec = ${nsec} }`],
                Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
        } catch (e) {
            console.error(`listen-together: cannot set the delay of ${name}: ${e.message}`);
        }
    }

    _applyOffsets() {
        const names = this.devices.map(s => s.get_name());
        const offsets = latencyOffsets(this._delays, names);
        for (const [name, nsec] of Object.entries(offsets)) {
            if ((this._offsets[name] ?? 0) !== nsec)
                this._setOffset(name, nsec);
        }
        this._offsets = offsets;
    }

    // Devices are left as they were found: an offset would also shift the
    // sound of a device used on its own.
    _clearOffsets() {
        const connected = new Set(this._control.get_sinks().map(s => s.get_name()));
        for (const [name, nsec] of Object.entries(this._offsets)) {
            if (nsec !== 0 && connected.has(name))
                this._setOffset(name, 0);
        }
        this._offsets = {};
    }

    _streamAdded(id) {
        const stream = this._control.lookup_stream_id(id);
        if (this.active && !this._switched && stream?.get_name() === SINK_NAME)
            this._switchTo(stream);
        this._sync();
    }

    _defaultChanged(id) {
        if (!this.active || !this._switched)
            return;
        const stream = this._control.lookup_stream_id(id);
        // The user chose another output in the sound menu: sharing is over.
        if (stream && stream.get_name() !== SINK_NAME)
            this.stop(false);
    }

    _sync() {
        // A headset went away: one listener left, nothing to share.
        if (this.active && this.devices.length < 2) {
            this.stop();
        } else {
            // A third headset joined, or one of three left.
            if (this.active && this._switched)
                this._applyOffsets();
            this._onChanged();
        }
    }
}
