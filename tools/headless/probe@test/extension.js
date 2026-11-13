// SPDX-License-Identifier: GPL-2.0-or-later
// Test driver for tools/headless/run.sh. It polls $PROBE_DIR/cmd, runs the
// one command written there, then deletes the file:
//   open | close      the Quick Settings menu
//   click             the Listen Together tile
//   menu              open the tile's own menu
//   volume <i> <0..1> move the slider of the i-th headset
//   delay <i> <ms>    move the delay slider of the i-th headset
//   state <name>      write what the tile shows to <name>.json
//   shot <name>       screenshot of the whole screen to <name>.png
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export default class Probe {
    enable() {
        this._dir = GLib.getenv('PROBE_DIR');
        this._id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => this._tick());
    }

    disable() {
        GLib.source_remove(this._id);
    }

    _toggle() {
        const qs = Main.panel.statusArea.quickSettings;
        return qs.menu._grid.get_children().find(c => c.constructor.name === 'ShareToggle') ?? null;
    }

    _items() {
        return this._toggle()?._devices._getMenuItems() ?? [];
    }

    _tick() {
        const path = `${this._dir}/cmd`;
        if (!GLib.file_test(path, GLib.FileTest.EXISTS))
            return GLib.SOURCE_CONTINUE;
        const [, bytes] = GLib.file_get_contents(path);
        const [cmd, ...args] = new TextDecoder().decode(bytes).trim().split(/\s+/);
        try {
            this._run(cmd, args);
        } catch (e) {
            logError(e, 'probe');
            GLib.file_set_contents(`${this._dir}/error`, `${cmd}: ${e.message}\n`);
        }
        GLib.unlink(path);
        return GLib.SOURCE_CONTINUE;
    }

    _run(cmd, args) {
        const qs = Main.panel.statusArea.quickSettings;
        const toggle = this._toggle();
        switch (cmd) {
        case 'open':
            qs.menu.open();
            break;
        case 'close':
            qs.menu.close();
            break;
        case 'click':
            toggle.emit('clicked', Clutter.BUTTON_PRIMARY);
            break;
        case 'menu':
            toggle.menu.open();
            break;
        case 'volume':
            this._items()[Number(args[0])]._slider.value = Number(args[1]);
            break;
        case 'delay':
            this._items()[Number(args[0])]._delaySlider.value = Number(args[1]) / 500;
            break;
        case 'state':
            GLib.file_set_contents(`${this._dir}/${args[0]}.json`, JSON.stringify({
                found: toggle !== null,
                visible: toggle?.visible ?? false,
                mapped: toggle?.mapped ?? false,
                checked: toggle?.checked ?? false,
                title: toggle?.title ?? null,
                subtitle: toggle?.subtitle ?? null,
                devices: this._items().map(i => i._stream.get_description()),
                sliders: this._items().map(i => Math.round(i._slider.value * 100) / 100),
                delays: this._items().map(i => i._delayLabel.text),
                panelIcons: qs._indicators.get_children().filter(c => c.visible).length,
            }) + '\n');
            break;
        case 'shot': {
            const file = Gio.File.new_for_path(`${this._dir}/${args[0]}.png`);
            const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
            new Shell.Screenshot().screenshot(false, stream, (o, res) => {
                try {
                    o.screenshot_finish(res);
                } catch (e) {
                    logError(e, 'probe');
                }
                stream.close(null);
            });
            break;
        }
        default:
            throw new Error(`unknown command ${cmd}`);
        }
    }
}
