// SPDX-License-Identifier: GPL-2.0-or-later
// gjs -m tests/model.test.js
import {
    SINK_NAME, isBluetoothSink, canShare, volumeToFraction, fractionToVolume,
    clampDelay, latencyOffsets, Coalescer,
} from '../extension/model.js';

let failed = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok)
        failed++;
    print(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
}

check('bluetooth sink', isBluetoothSink('bluez_output.AA_BB_CC_DD_EE_FF.1'), true);
check('speaker is not bluetooth', isBluetoothSink('alsa_output.pci-0000_00_1f.3.analog-stereo'), false);
check('bluetooth microphone is not an output', isBluetoothSink('bluez_input.AA_BB_CC_DD_EE_FF.0'), false);
check('our own output is not bluetooth', isBluetoothSink(SINK_NAME), false);
check('null name', isBluetoothSink(null), false);

check('no sink', canShare([]), false);
check('one headset', canShare(['alsa_output.x', 'bluez_output.A.1']), false);
check('two headsets', canShare(['bluez_output.A.1', 'alsa_output.x', 'bluez_output.B.1']), true);
check('three headsets', canShare(['bluez_output.A.1', 'bluez_output.B.1', 'bluez_output.C.1']), true);
check('two headsets and our output', canShare(['bluez_output.A.1', SINK_NAME, 'bluez_output.B.1']), true);

check('half volume', volumeToFraction(32768, 65536), 0.5);
check('boosted volume is clamped', volumeToFraction(90000, 65536), 1);
check('no scale', volumeToFraction(100, 0), 0);
check('fraction to volume', fractionToVolume(0.5, 65536), 32768);
check('fraction above one', fractionToVolume(1.4, 65536), 65536);
check('negative fraction', fractionToVolume(-1, 65536), 0);

check('delay rounded to the step', clampDelay(123), 120);
check('delay capped', clampDelay(900), 500);
check('negative delay', clampDelay(-40), 0);
check('not a number', clampDelay(NaN), 0);
check('no delay, no offset', latencyOffsets({}, ['a', 'b']), {a: 0, b: 0});
check('delaying one declares the other late', latencyOffsets({a: 120}, ['a', 'b']), {a: 0, b: 120000000});
check('only the difference counts', latencyOffsets({a: 200, b: 50}, ['a', 'b']), {a: 0, b: 150000000});
check('three devices', latencyOffsets({a: 100, c: 30}, ['a', 'b', 'c']), {a: 0, b: 100000000, c: 70000000});
check('absent devices are ignored', latencyOffsets({gone: 400, a: 20}, ['a', 'b']), {a: 0, b: 20000000});

// A fake timer: scheduled callbacks wait until tick() runs them.
{
    const timers = new Map();
    let next = 1, runs = 0;
    const c = new Coalescer(fn => { timers.set(next, fn); return next++; }, id => timers.delete(id), () => runs++);
    for (let i = 0; i < 40; i++)
        c.request();
    check('many requests, one timer', timers.size, 1);
    check('nothing runs before the timer', runs, 0);
    const [[, fire]] = [...timers];
    timers.clear();
    fire();
    check('the timer runs the action once', runs, 1);
    c.request();
    check('a new request after the run arms a new timer', timers.size, 1);
    c.cancel();
    check('cancel drops the pending timer', timers.size, 0);
    c.cancel();
    c.request();
    check('requests work again after a cancel', timers.size, 1);
}

if (failed) {
    print(`${failed} test(s) failed`);
    imports.system.exit(1);
}
print('model: all tests passed');
