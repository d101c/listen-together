# extensions.gnome.org — dossier de soumission (préparé le 11 novembre 2026)

Rien ici n'est envoyé : ce dossier rassemble ce qu'il faut pour l'upload, à
faire depuis le navigateur de l'utilisateur (compte EGO `jg__`).

## Listen Together 0.2 (première soumission)

1. Dépôt GitHub public (fait le 11 novembre 2026, historique réécrit en un
   seul commit) : son URL est dans `metadata.json`.
2. `./pack.sh` → `listen-together@griffit.gmail.com.shell-extension.zip`.
3. Upload du zip sur https://extensions.gnome.org/upload/ (cocher les deux
   cases : licence compatible, conditions acceptées).
4. Sur la fiche créée :
   - icône : `docs/icon/listen-together-256.png`, deux casques superposés (source : `listen-together.svg`) ;
   - capture : `docs/ego/screenshot.png` (noms d'appareils d'illustration,
     nom du Wi-Fi masqué).
5. Description : celle de `extension/metadata.json`, reprise automatiquement.
   Depuis la 0.4 elle ne compare plus avec Share Audio d'Apple ; elle garde
   seulement la mention que les marques AirPods et Beats appartiennent à
   Apple et que l'extension n'est pas affiliée.
6. Commentaire auteur à poster dès la première revue, en anglais (version
   0.4, mise à jour du 13 novembre 2026) :

> Changes since 0.3: moving a delay slider now runs `pw-cli` at most once
> every 150 ms (a single pending timer applying the latest value) instead of
> once per step; stopping sharing sends SIGTERM to the `pipewire` child and
> falls back to SIGKILL after 2 s, and disable() removes every timer; the
> description is shorter; the GPL text is shipped in the zip and each file
> has an SPDX header; a few clean-ups (no empty catch, GLib.Source.remove).
>
> Points a reviewer may ask about: (1) while sharing is on, the extension
> runs `pipewire -c combine.conf` (the file is in the extension) as a child
> process through Gio.Subprocess, without a shell; it loads PipeWire's
> combine-stream module as a client and is stopped on disable(), which
> removes the virtual output and restores the previous default output. (2)
> The delay sliders run `pw-cli set-param <sink> Props { latencyOffsetNsec = N }`
> on Bluetooth outputs; offsets go back to 0 when sharing stops. (3)
> `session-modes` includes `unlock-dialog` so that locking the screen during
> a film does not cut the sound in one headset; the reason is in a comment
> above disable(). The tile adds nothing to the top bar and is hidden unless
> two Bluetooth outputs are connected. The mixer comes from
> `Volume.getMixerControl()`; no private member of the shell is touched.
> I used AI assistance to write and review this code and can explain every
> line.

## Réponses attendues des relecteurs

- Sous-processus : `Gio.Subprocess`, sans shell, arrêté dans `disable()`.
- `unlock-dialog` : justification ci-dessus et dans `extension.js`.
- Marques Apple (AirPods, Beats) : seule la mention de non-affiliation reste
  dans la description depuis la 0.4.
- « AI-generated » : réponse honnête (outil, code assumé).
