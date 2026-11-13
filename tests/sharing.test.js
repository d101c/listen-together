// SPDX-License-Identifier: GPL-2.0-or-later
// End-to-end test of the engine against the real PipeWire of the session,
// with two silent fake headsets instead of real ones. Run through
// tests/run.sh, which sets the paths gjs needs to load Gvc.
//
// It switches the default output for a few seconds and puts it back.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gvc from 'gi://Gvc';

import {Sharing} from '../extension/sharing.js';
import {SINK_NAME} from '../extension/model.js';

const here = GLib.path_get_dirname(GLib.filename_from_uri(import.meta.url)[0]);
const CONF = GLib.build_filenamev([here, '..', 'extension', 'combine.conf']);
const FAKE_A = 'bluez_output.FA_KE_00_00_00_01.1';
const FAKE_B = 'bluez_output.FA_KE_00_00_00_02.1';

let failed = 0;
function check(name, ok, detail = '') {
    if (!ok)
        failed++;
    print(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
}

function sleep(ms) {
    return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
        resolve();
        return GLib.SOURCE_REMOVE;
    }));
}

async function waitFor(pred, timeoutMs = 6000) {
    const deadline = GLib.get_monotonic_time() + timeoutMs * 1000;
    while (GLib.get_monotonic_time() < deadline) {
        if (pred())
            return true;
        await sleep(50);
    }
    return pred();
}

function run(argv) {
    const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE);
    const [, out] = proc.communicate_utf8(null, null);
    return out ?? '';
}

// A silent output named like a Bluetooth headset. It stays (object.linger)
// until removeFake() destroys it.
function addFake(name, description) {
    run(['pw-cli', 'create-node', 'adapter',
        `{ factory.name=support.null-audio-sink node.name="${name}" node.description="${description}" ` +
        'media.class=Audio/Sink audio.position=[FL FR] object.linger=true }']);
}

function removeFake(name) {
    run(['pw-cli', 'destroy', name]);
}

// True when something feeds the playback ports of the named output.
function isFed(links, sink) {
    return new RegExp(`${sink.replaceAll('.', '\\.')}:playback_FL\\n\\s+\\|<-`).test(links);
}

async function main() {
    const control = new Gvc.MixerControl({name: 'listen-together tests'});
    control.open();
    check('mixer ready', await waitFor(() => control.get_state() === Gvc.MixerControlState.READY));
    await sleep(300);

    const names = () => control.get_sinks().map(s => s.get_name());
    const defaultName = () => control.get_default_sink()?.get_name() ?? null;
    const initial = defaultName();
    print(`# default output before the tests: ${initial}`);

    let changes = 0;
    const sharing = new Sharing(control, CONF, () => changes++);
    try {
        if (sharing.devices.length > 0) {
            print('# real Bluetooth outputs are connected: skipping, the test needs a clean slate');
            return;
        }
        check('not available without headsets', sharing.available === false);
        sharing.start();
        check('start is refused without headsets', sharing.active === false);

        addFake(FAKE_A, 'Casque de Camille');
        check('one headset is not enough', await waitFor(() => sharing.devices.length === 1) && !sharing.available);
        addFake(FAKE_B, 'Casque de Julien');
        check('two headsets detected', await waitFor(() => sharing.devices.length === 2));
        check('available with two headsets', sharing.available === true);
        check('default output untouched by the headsets', defaultName() === initial, defaultName());
        check('listener notified', changes > 0);

        // On, off.
        sharing.start();
        check('active right after start', sharing.active === true);
        check('shared output becomes the default', await waitFor(() => defaultName() === SINK_NAME), defaultName());
        await sleep(500);
        const links = run(['pw-link', '-l']);
        check('first headset is fed', isFed(links, FAKE_A));
        check('second headset is fed', isFed(links, FAKE_B));
        sharing.stop();
        check('inactive right after stop', sharing.active === false);
        check('previous output restored', await waitFor(() => defaultName() === initial), defaultName());
        check('shared output removed', await waitFor(() => !names().includes(SINK_NAME)));

        // On again, then the user picks another output in the sound menu.
        sharing.start();
        check('second start', await waitFor(() => defaultName() === SINK_NAME), defaultName());
        const other = control.get_sinks().find(s => s.get_name() === FAKE_A);
        control.set_default_sink(other);
        check('picking another output stops sharing', await waitFor(() => !sharing.active));
        check('the picked output is kept', await waitFor(() => defaultName() === FAKE_A), defaultName());
        check('shared output removed again', await waitFor(() => !names().includes(SINK_NAME)));
        control.set_default_sink(control.get_sinks().find(s => s.get_name() === initial));
        check('back to the initial output', await waitFor(() => defaultName() === initial), defaultName());

        // On again, then a headset disconnects.
        sharing.start();
        check('third start', await waitFor(() => defaultName() === SINK_NAME), defaultName());
        removeFake(FAKE_B);
        check('losing a headset stops sharing', await waitFor(() => !sharing.active));
        check('no longer available', await waitFor(() => !sharing.available));
        check('previous output restored after the loss', await waitFor(() => defaultName() === initial), defaultName());
        check('shared output removed after the loss', await waitFor(() => !names().includes(SINK_NAME)));
    } finally {
        sharing.destroy();
        removeFake(FAKE_A);
        removeFake(FAKE_B);
        await sleep(300);
        const sink = control.get_sinks().find(s => s.get_name() === initial);
        if (sink && defaultName() !== initial)
            control.set_default_sink(sink);
        await sleep(200);
        print(`# default output after the tests: ${defaultName()}`);
        control.close();
    }
}

const loop = new GLib.MainLoop(null, false);
main().catch(e => {
    failed++;
    printerr(`sharing test crashed: ${e}\n${e.stack}`);
}).finally(() => loop.quit());
loop.run();

if (failed) {
    print(`${failed} test(s) failed`);
    imports.system.exit(1);
}
print('sharing: all tests passed');
