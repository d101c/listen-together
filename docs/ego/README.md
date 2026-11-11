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
   Elle compare directement avec Share Audio d'Apple et explique le réglage
   de retard ; les marques Apple sont citées avec la mention d'usage.
6. Commentaire auteur à poster dès la première revue, en anglais :

> Listen Together has no helper and ships no binary. Three points a reviewer
> may ask about: (1) while sharing is on it runs `pipewire -c combine.conf`
> (the file is in the extension) as a child process, which loads PipeWire's
> combine-stream module as a client; the process is stopped on disable(),
> which removes the virtual output and restores the previous default output.
> (2) The delay sliders run `pw-cli set-param <sink> Props { latencyOffsetNsec = N }`
> on Bluetooth outputs; offsets are reset to 0 when sharing stops. (3)
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
- Mention d'Apple dans la description : usage descriptif des marques, avec
  la mention de non-affiliation. À retirer si un relecteur le demande.
- « AI-generated » : réponse honnête (outil, code assumé).
