# Ascent ESSLCE — Offline Android App

This project wraps your ESSLCE Tracker in an Android app. All web files are
bundled inside the APK (app/src/main/assets/www/), so it works with no internet.

The app requests no network permission, so it cannot reach the internet itself.
Links to outside websites (e.g. the resource links in the plan) open in the
phone's browser when you are online.


## 0. Easiest: build in the cloud (no installs)

1. Create a free GitHub account and a new repository (set it to Private if you like).
2. Upload the contents of this folder to the repository (including the hidden `.github` folder).
3. Open the repository's Actions tab. The "Build APK" workflow runs automatically
   (or click it and choose "Run workflow").
4. When the run finishes (about 5 minutes), open it and download the artifact
   "Ascent-ESSLCE-debug-apk". Unzip it to get app-debug.apk.
5. Copy app-debug.apk to your phone and install it as described in section 2.

## 1. Build the APK (one time, on a computer with internet)

Option A — Android Studio (easiest)
1. Install Android Studio (https://developer.android.com/studio).
2. File > Open > select the folder `Ascent-ESSLCE-Android`.
3. Let it sync (it downloads Gradle and the Android SDK automatically).
4. Build > Build Bundle(s) / APK(s) > Build APK(s).
5. The APK is at: app/build/outputs/apk/debug/app-debug.apk

Option B — command line (needs Gradle 8.7 installed and JDK 17+)
    cd Ascent-ESSLCE-Android
    gradle wrapper --gradle-version 8.7
    ./gradlew assembleDebug
The APK is then at app/build/outputs/apk/debug/app-debug.apk

## 2. Install on your phone

1. Copy app-debug.apk to the phone (USB, Google Drive, Telegram, etc.).
2. Open it. When prompted, allow "Install unknown apps" for your file manager or browser.
3. Tap Install, then open "Ascent ESSLCE". It works with airplane mode on.

## Notes

- Your progress is saved on the phone (localStorage inside the app). It is kept
  unless you uninstall the app or clear its storage. Uninstalling erases progress,
  so use the app's own export feature, if it has one, before uninstalling.
- Updating: change the files in app/src/main/assets/www/, rebuild, and reinstall
  over the existing app. Progress is kept when the package name and signing match.
- For Play Store distribution, build a release APK/AAB and sign it with your own keystore.
