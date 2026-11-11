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
export const DELAY_STEP_MS = 10;

export function clampDelay(ms) {
    if (!Number.isFinite(ms))
        return 0;
    const stepped = Math.round(ms / DELAY_STEP_MS) * DELAY_STEP_MS;
    return Math.min(MAX_DELAY_MS, Math.max(0, stepped));
}

// PipeWire cannot be told "hold this output back"; it can be told that an
// output is slower than it says (its latency offset), and the shared output
// then holds the others back to match. So delaying one device means
// declaring every other one late by the difference.
// delays: {name: ms}. Returns {name: latency offset in nanoseconds}.
export function latencyOffsets(delays, names) {
    const wanted = names.map(n => clampDelay(delays[n] ?? 0));
    const longest = Math.max(0, ...wanted);
    return Object.fromEntries(names.map((n, i) => [n, (longest - wanted[i]) * 1000000]));
}
