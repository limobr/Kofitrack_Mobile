# KofiTrack Release Guide

How to ship a new Android build so it installs cleanly as an **upgrade**
(not a fresh install) and gets picked up correctly by the in-app updater.

This only has to be read carefully once. After the one-time `eas.json`
setup below, every release is just the **Repeatable Release Steps**
section.

---

## Why this guide exists

Two things have to line up for an update to "just work":

1. **Same signing key, every release.** Android identifies an app by its
   package name (`com.kofitrack.clerk`) *and* the certificate it was
   signed with. If a release APK is signed with a different key than
   what's currently installed, Android refuses to install it as an
   upgrade — it makes the user uninstall first, which **wipes their local
   data** (offline deliveries, print queue, cached settings). This is the
   failure mode the whole "PERMISSIONS / signed with the same release
   keystore" requirement in the original spec is about.
2. **Matching version numbers.** The backend's `app_versions.build_number`
   has to be the *exact* Android `versionCode` baked into the APK you
   uploaded, or the mobile app's comparison (`Application.nativeBuildVersion`
   vs the server's `buildNumber`) will be wrong — either nagging users who
   are already current, or never offering a real update.

Everything below exists to make both of those automatic instead of
something you have to remember.

---

## One-time setup (already done in this repo, read so you understand it)

### 1. `eas.json` — remote version source + a dedicated release profile

```json
{
  "cli": {
    "version": ">= 5.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "production": {
      "distribution": "store",
      "android": { "buildType": "app-bundle" },
      "autoIncrement": true
    },
    "github-release": {
      "extends": "production",
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "autoIncrement": true
    }
  }
}
```

What each piece does:

- **`appVersionSource: "remote"`** — EAS's servers become the source of
  truth for `versionCode`, instead of a number you'd otherwise have to
  hand-edit in `app.json` and remember to bump every time. (`development`
  and `preview` profiles are unaffected by this and unchanged.)
- **`production`** — unchanged in purpose (Play Store, `.aab`), now with
  `autoIncrement: true` so its `versionCode` goes up automatically on every
  build instead of failing a Play Store upload because you forgot.
- **`github-release`** — the profile you'll actually use for this updater.
  It `extends: "production"`, which means it **inherits the same signing
  credentials** as your Play Store build — that's the part that guarantees
  the keystore matches release after release, with nothing to configure by
  hand. It only overrides two things: `buildType: "apk"` (an `.aab` can't
  be installed directly — Google Play splits and re-signs those, so it's
  the wrong artifact for sideloading) and `distribution: "internal"` (skip
  store packaging rules, just hand back a downloadable file).

### 2. Confirm there's exactly one Android keystore

Run once, and again any time something feels off:

```bash
eas credentials --platform android
```

You should see exactly one keystore for `com.kofitrack.clerk`. If EAS
ever offers to "generate a new keystore" during a build and you say yes
without thinking, you've just created a second one — and the *next*
release built with that one will stop being installable as an upgrade
over everything already in the field. When in doubt, choose "use existing
keystore."

### 3. Never build the release artifact locally

`expo run:android`, a local `prebuild` + Android Studio build, or any
profile with `"android": { "withoutCredentials": true }` will sign with
your **local debug keystore**, not the one EAS manages. That keystore is
different on every machine. Only `eas build --profile github-release`
(run on EAS's servers) uses the real release keystore. This is the most
common way this silently breaks.

### 4. If KofiTrack is ever also published to the Play Store

Skip this if it isn't (this app currently isn't store-distributed, so
nothing to do) — but if you do submit to Play later: **Google Play App
Signing re-signs your upload with Google's own key before it reaches
users.** That means anyone who installed via the Play Store has an APK
signed with Google's certificate, not your EAS keystore — a
GitHub-Releases update built from the `github-release` profile would
*not* install as an upgrade for those users (wrong signer, from their
point of view). If that day comes, treat Play Store users and
sideload/GitHub-Releases users as two permanently separate channels —
don't try to cross-update between them.

---

## Repeatable Release Steps

### 1. Bump the user-facing version

In `mobile/app.json`:

```json
{ "expo": { "version": "1.0.5" } }
```

This is the human-readable string shown in the update prompt ("Version
1.0.5 is available"). Bump it however you like (semver, etc.) — it's
cosmetic and unrelated to `versionCode`. Leave `android.versionCode`
out of `app.json` entirely; remote versioning manages it and ignores
whatever's there anyway.

### 2. Build

```bash
cd mobile
eas build --platform android --profile github-release
```

Watch the build log for a line like:

```
✔ Incremented versionCode from 12 to 13.
```

That `13` is the **build number** you'll enter in step 5. If you miss it
in the log, fetch it any time with:

```bash
eas build:version:get --platform android --non-interactive --json
```

### 3. Create the GitHub Release

In the `KofiTrack_Releases` repo (public, holds APKs only):

- Tag: `v1.0.5` (matches the version from step 1, with a leading `v`)
- Upload the `.apk` EAS just built as a release asset
- Name the asset `KofiTrack-v1.0.5.apk` (matches the existing naming
  convention the backend's `GET /api/mobile/latest-version` URL points
  to)

Copy the asset's **direct download URL** — right-click the asset link on
the release page, not the release page URL itself. It looks like:

```
https://github.com/<you>/KofiTrack_Releases/releases/download/v1.0.5/KofiTrack-v1.0.5.apk
```

### 4. Publish it in the admin panel

Go to **Admin → App Updates → + Publish New Version** and fill in:

| Field | Value |
|---|---|
| Version | `1.0.5` (no leading `v`) |
| Build Number | `13` (from step 2) |
| APK Download URL | the link from step 3 |
| Title / Message | what shows at the top of the update prompt |
| Release Notes | one bullet per line |
| Mandatory | check only if older versions must be blocked |

Hit Publish. The panel does a HEAD request to the APK URL to record its
size, which is what lets the mobile app show "~38 MB" before anyone
downloads it. The mobile app picks this up on its next check (launch,
foreground, login, or someone tapping "Check for Updates") — no
deploy needed on the backend.

If you'd rather script this (CI, or just prefer a terminal), the
equivalent is:

```bash
cd web
npx tsx scripts/publish-app-version.ts \
  --version=1.0.5 --build=13 \
  --apk=https://github.com/<you>/KofiTrack_Releases/releases/download/v1.0.5/KofiTrack-v1.0.5.apk \
  --title="New Update Available" \
  --message="Performance improvements and bug fixes." \
  --notes="Improved dashboard performance|Fixed notification bugs"
```

Both paths write to the same `app_versions` table — use whichever's
convenient; the admin panel is just a nicer face on the same script.

### 5. Verify the upgrade actually upgrades

Before telling anyone it's out: install the new APK over a device/emulator
that already has the previous release installed (don't uninstall first).
If it installs silently as an update and your test data (members,
deliveries, print queue) is still there afterward, the signing chain is
intact. If Android prompts "App not installed" or forces an uninstall,
stop — that means a keystore mismatch happened somewhere above, and
publishing it would break upgrades for every existing install.

---

## Quick troubleshooting

| Symptom | Likely cause |
|---|---|
| "App not installed" when updating | Different signing key — check `eas credentials`, confirm the build came from `eas build --profile github-release` (not a local build) |
| Update installs but wipes local data | Same as above — Android treated it as a different app |
| Mobile app never offers the update | `build_number` in the published row isn't greater than the installed `versionCode` — double check step 2's log output |
| Mobile app offers an update every launch even after installing | The installed build's `versionCode` doesn't match what you published — you may have published a build number that doesn't correspond to the actual APK |
| Admin panel shows no size (—) | The HEAD request to the APK URL failed or GitHub didn't return `Content-Length` on redirect — not fatal, just cosmetic |
