// SPDX-License-Identifier: GPL-2.0-or-later
// Pure rules, no GNOME imports: testable with plain gjs.

// node.name of the virtual output declared in combine.conf.
export const SINK_NAME = 'listen_together';

// Bluetooth outputs are named bluez_output.<address>.<n> by PipeWire.
export function isBluetoothSink(name) {
    return typeof name === 'string' && name.startsWith('bluez_output.');
}

// Sharing makes sense from two Bluetooth outputs up.
export function canShare(sinkNames) {
    return sinkNames.filter(isBluetoothSink).length >= 2;
}

// Slider position (0..1) for a stream volume, and back.
export function volumeToFraction(volume, maxNorm) {
    if (!(maxNorm > 0))
        return 0;
    return Math.min(1, Math.max(0, volume / maxNorm));
}

export function fractionToVolume(fraction, maxNorm) {
    return Math.round(Math.min(1, Math.max(0, fraction)) * maxNorm);
}

// Speakers do not all take the same time to play what they receive. The
// delay slider of a device holds it back by up to this much.
export const MAX_DELAY_MS = 500;
const DELAY_STEP_MS = 10;

export function clampDelay(ms) {
    if (!Number.isFinite(ms))
        return 0;
    const stepped = Math.round(ms / DELAY_STEP_MS) * DELAY_STEP_MS;
    return Math.min(MAX_DELAY_MS, Math.max(0, stepped));
}

// PipeWire has no "hold this output back": it takes a latency offset (the
// output is slower than it says) and the shared output holds the others back
// to match. So delaying one device declares every other one late by the
// difference. delays: {name: ms}. Returns {name: offset in nanoseconds}.
export function latencyOffsets(delays, names) {
    const wanted = names.map(n => clampDelay(delays[n] ?? 0));
    const longest = Math.max(0, ...wanted);
    return Object.fromEntries(names.map((n, i) => [n, (longest - wanted[i]) * 1000000]));
}

// Runs fn once, a little later, however many times request() is called in
// between. schedule(fn) starts a timer and returns its id; cancel(id) drops it.
export class Coalescer {
    constructor(schedule, cancel, fn) {
        this._schedule = schedule;
        this._cancel = cancel;
        this._fn = fn;
        this._id = 0;
    }

    request() {
        if (this._id)
            return;
        this._id = this._schedule(() => {
            this._id = 0;
            this._fn();
            return false;
        });
    }

    cancel() {
        if (!this._id)
            return;
        this._cancel(this._id);
        this._id = 0;
    }
}
