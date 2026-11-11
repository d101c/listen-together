// Listen Together: one Quick Settings tile that sends the sound to every
// connected Bluetooth headset. The tile is only there while two or more are
// connected, and nothing is added to the top bar.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension, gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

import {Sharing} from './sharing.js';
import {MAX_DELAY_MS, clampDelay, fractionToVolume, volumeToFraction} from './model.js';

const ICON = 'audio-headphones-symbolic';

// One headset in the tile's menu: its name, its own volume slider and its
// delay slider.
const DeviceItem = GObject.registerClass(
class DeviceItem extends PopupMenu.PopupBaseMenuItem {
    _init(control, stream, delayMs, onDelay) {
        super._init({activate: false, can_focus: false});
        this._control = control;
        this._stream = stream;
        this._onDelay = onDelay;

        const box = new St.BoxLayout({x_expand: true, style: 'spacing: 6px;'});
        // Set on the layout manager: St.BoxLayout's own property was renamed
        // (vertical -> orientation) in GNOME 48.
        box.layout_manager.orientation = Clutter.Orientation.VERTICAL;
        box.add_child(new St.Label({text: stream.get_description() ?? stream.get_name()}));

        const row = new St.BoxLayout({x_expand: true, style: 'spacing: 12px;'});
        this._icon = new St.Icon({style_class: 'popup-menu-icon'});
        row.add_child(this._icon);
        this._slider = new Slider(0);
        this._slider.x_expand = true;
        this._slider.accessible_name = stream.get_description() ?? '';
        row.add_child(this._slider);
        box.add_child(row);

        // Holds this device back so that it lines up with a slower one.
        const delayRow = new St.BoxLayout({x_expand: true, style: 'spacing: 12px;'});
        delayRow.add_child(new St.Icon({
            style_class: 'popup-menu-icon',
            icon_name: 'preferences-system-time-symbolic',
        }));
        this._delaySlider = new Slider(clampDelay(delayMs) / MAX_DELAY_MS);
        this._delaySlider.x_expand = true;
        this._delaySlider.accessible_name = _('Delay');
        delayRow.add_child(this._delaySlider);
        this._delayLabel = new St.Label({
            y_align: Clutter.ActorAlign.CENTER,
            style: 'min-width: 4.5em; text-align: right;',
        });
        delayRow.add_child(this._delayLabel);
        box.add_child(delayRow);
        this._delayMs = clampDelay(delayMs);
        this._showDelay();
        this._delaySliderId = this._delaySlider.connect('notify::value', () => {
            const ms = clampDelay(this._delaySlider.value * MAX_DELAY_MS);
            if (ms === this._delayMs)
                return;
            this._delayMs = ms;
            this._showDelay();
            this._onDelay(this._stream.get_name(), ms);
        });
        this.add_child(box);

        this._sliderId = this._slider.connect('notify::value', () => this._push());
        this._streamIds = [
            stream.connect('notify::volume', () => this._pull()),
            stream.connect('notify::is-muted', () => this._pull()),
        ];
        this._pull();
    }

    destroy() {
        for (const id of this._streamIds)
            this._stream.disconnect(id);
        this._streamIds = [];
        this._slider.disconnect(this._sliderId);
        this._delaySlider.disconnect(this._delaySliderId);
        super.destroy();
    }

    _showDelay() {
        // Translators: a delay in milliseconds, e.g. "120 ms".
        this._delayLabel.text = _('%d ms').format(this._delayMs);
    }

    _maxNorm() {
        return this._control.get_vol_max_norm();
    }

    // Slider -> headset.
    _push() {
        const volume = fractionToVolume(this._slider.value, this._maxNorm());
        if (this._stream.volume === volume)
            return;
        this._stream.volume = volume;
        this._stream.push_volume();
        if (this._stream.is_muted && volume > 0)
            this._stream.change_is_muted(false);
    }

    // Headset -> slider (volume keys on the headset, the sound settings…).
    _pull() {
        const fraction = this._stream.is_muted
            ? 0 : volumeToFraction(this._stream.volume, this._maxNorm());
        this._slider.block_signal_handler(this._sliderId);
        this._slider.value = fraction;
        this._slider.unblock_signal_handler(this._sliderId);
        this._icon.icon_name = fraction === 0
            ? 'audio-volume-muted-symbolic'
            : fraction < 0.34 ? 'audio-volume-low-symbolic'
                : fraction < 0.67 ? 'audio-volume-medium-symbolic'
                    : 'audio-volume-high-symbolic';
    }
});

const ShareToggle = GObject.registerClass(
class ShareToggle extends QuickSettings.QuickMenuToggle {
    _init(control, confPath, settings) {
        super._init({
            // Short on purpose: a tile with a menu arrow fits about eleven
            // characters. The menu header carries the full name.
            title: _('Share Audio'),
            iconName: ICON,
            toggleMode: false,
            visible: false,
        });
        this._control = control;
        this._settings = settings;
        this._delays = settings.get_value('delays').deepUnpack();
        this._deviceIds = '';

        this.menu.setHeader(ICON, _('Listen Together'), _('The same sound in every headset'));
        this._devices = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._devices);

        this._sharing = new Sharing(control, confPath, () => this._sync());
        this._sharing.setDelays(this._delays);
        this._clickedId = this.connect('clicked', () => {
            if (this._sharing.active)
                this._sharing.stop();
            else
                this._sharing.start();
        });
        this._sync();
    }

    destroy() {
        this.disconnect(this._clickedId);
        // Stops sharing and disconnects from the mixer.
        this._sharing.destroy();
        super.destroy();
    }

    _setDelay(name, ms) {
        this._delays[name] = ms;
        this._sharing.setDelays(this._delays);
        this._settings.set_value('delays', new GLib.Variant('a{si}', this._delays));
    }

    _sync() {
        const devices = this._sharing.devices;
        const active = this._sharing.active;
        this.visible = active || this._sharing.available;
        this.checked = active;
        this.subtitle = active
            ? ngettext('%d device', '%d devices', devices.length).format(devices.length)
            : null;

        // The sliders are rebuilt only when the set of headsets changes, so
        // that a slider being dragged is never replaced under the pointer.
        const ids = devices.map(s => s.get_id()).join(',');
        if (ids === this._deviceIds)
            return;
        this._deviceIds = ids;
        this._devices.removeAll();
        for (const stream of devices) {
            this._devices.addMenuItem(new DeviceItem(this._control, stream,
                this._delays[stream.get_name()] ?? 0,
                (name, ms) => this._setDelay(name, ms)));
        }
    }
});

const Indicator = GObject.registerClass(
class Indicator extends QuickSettings.SystemIndicator {
    _init(confPath, settings) {
        super._init();
        // No _addIndicator(): the top bar stays as it is.
        this.quickSettingsItems.push(new ShareToggle(Volume.getMixerControl(), confPath, settings));
    }

    destroy() {
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

export default class ListenTogether extends Extension {
    enable() {
        this._indicator = new Indicator(
            this.dir.get_child('combine.conf').get_path(), this.getSettings());
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        // This extension also runs on the lock screen (unlock-dialog in
        // session-modes): locking the screen during a film must not cut the
        // sound in one of the headsets. disable() is therefore only called
        // when the extension is really turned off or the session ends. It
        // stops sharing, which removes the shared output and puts back the
        // output that was in use before, and removes the tile.
        this._indicator?.destroy();
        this._indicator = null;
    }
}
