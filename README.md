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
- **CI APK update warning:** GitHub Actions builds a debug APK using that runner's debug signing key. It is suitable for a first install/test, but a later CI build may not install over it because the signing key can differ. Export your progress before uninstalling. For seamless future updates, configure a stable private release-signing key; never commit that key to the repository.


## Daily Mission and focus widget (v1.3)

The original Today, Journey, Books, Practice, Reflect, and Settings views remain available. The additive Daily Mission layer puts the current study actions first, including a textbook portion, a recommended practice-question count, an English skill session, error repair, and a four-word vocabulary routine. Mission checkmarks and vocabulary are stored separately from the existing planner state so the previous progress schema is not overwritten.

- **Today:** focused daily tasks, textbook printed-page ranges, recommended question counts, four daily vocabulary entries, spaced recall at 1, 3, 7 and 14 days, and a compact subject coverage / practice-accuracy summary.
- **Journey:** a seven-day mission completion strip above the existing weekly plan.
- **English:** one main skill per reading session (comprehension, main idea, inference, vocabulary in context, grammar, cloze, paraphrase, or writing/language use). This is a starter skill rotation; validate and refine each chapter-to-skill mapping against the student's exact textbook edition and official ESSLCE materials before treating it as an official blueprint.
- **Daily reminder:** choose a time in the mission panel. Android builds schedule a local notification when notification permission is granted. In a desktop browser, the in-app reminder only appears while the app is open.
- **Focus notification:** the existing focus dock is mirrored to an ongoing Android notification, with pause/resume support and a completion alert.
- **Home-screen widget:** install the “Ascent Focus Timer” widget from the phone's widget picker. It shows a live countdown and provides Open / Pause / Resume controls. Android may delay alarms under battery restrictions; notification permission is required on Android 13+.

All mission additions are offline-first and use local storage or Android's local alarm/notification APIs. Back up existing progress before reinstalling or changing package/signing details.

### Mock exams, readiness and Reading Quest

The offline study tools now include timed subject or full-set mocks, question-level right / wrong / guessed logging, mock history, a repair queue, unit readiness estimates, and a bundled six-chapter original mystery called *The Lantern Archive*. Reading Quest saves tapped words in the shared word collection, supports a saved font-size setting, a three-question session flow, chapter unlocking, one branching choice, and a reading-level band. Story text is bundled in `reading-data.js`; no network fetch is used, so the feature works in airplane mode.

- New versioned local data keys: `ascent.mock.v1`, `ascent.reading.v1`, `ascent.repair.v1`, and `ascent.backup-dismiss.v1`. The original `ascent.esslce.v1` and `ascent.mission.v1` keys remain in place.
- Backup exports include the new versioned data. Old backups remain accepted; legacy sleep fields are ignored on import and excluded from new exports. A corrupt new-key value is copied to a timestamped backup key before fallback recovery.
- `exam-config.js` contains placeholder durations, question counts, and marks. These values are **not official ESSLCE facts** and must be verified against official ESSLCE material before use.
- Every readiness percentage is labelled “Practice estimate, not an official score.” Readiness is a practice aid, not an official exam prediction.
- Run `node scripts/test-features.js` for storage recovery, legacy-backup sanitising, readiness weights, repair spacing, adaptive rules, and streak-freeze checks.

### Curriculum data check

Run `node scripts/validate-study-data.js` to verify the six subject records, 20 textbook records, 140 unique units, valid week assignments, and one valid printed-page range per unit. The page ranges are taken from the existing portion map and must still be checked against the exact physical textbook edition used by the student. The CI workflow runs JavaScript syntax checks, this data validation, Android debug assembly, and Android lint on pushes and pull requests.


### Curriculum source and verification boundary

The textbook catalogue should be checked against the edition actually used by the student. Public reference points reviewed during this update:
- Ethiopia Ministry of Education, *Curriculum Framework for Ethiopian Education (KG–Grade 12)*: https://www.moe.gov.et/storage/Books/Curriculum%20Framework%20for%20Ethiopian%20Education%20%28KG%20%E2%80%93%20Grade%2012%29.pdf
- St. John’s University Library and Technology Services, MoE textbook catalogue (Grades 9–12): https://lts.stjohn.edu.et/find-borrow-request/moe-textbooks

These sources establish curriculum and textbook availability; they do **not** by themselves verify an official 2027 ESSLCE blueprint or the app's exact chapter-to-skill mapping. The English skill rotation is therefore a practice framework, not an official exam weighting. Printed-page ranges remain edition-sensitive and should be checked against the books used by the student.


### Release readiness

App version: **1.4.0** (version code 3). GitHub Actions checks bundled JavaScript, study-data integrity, feature rules, Android debug assembly, Android release assembly, and lint. The workflow publishes an installable debug APK for personal testing and an unsigned release APK to verify the release variant builds.

**Signing is still required before public distribution.** This repository intentionally contains no production signing key. Do not commit a keystore or passwords. Configure signing in a private release pipeline before publishing a signed APK or app bundle.

Before relying on Ascent for an exam journey:
1. Test Home, Today, Week, Progress, More, Books, Practice, Vocabulary, Focus, and Settings on the actual phone.
2. Export a backup, update/reinstall, import it, and confirm the original study plan and progress remain.
3. Test notification permission accepted and denied, reminders, focus pause/resume/finish, reboot restoration, and the home-screen widget on the target Android version.
4. Check the textbook edition and printed page ranges against the physical books being studied.
5. Verify mock durations, question counts, and marks against official ESSLCE material. Current values are placeholders, and readiness percentages are practice estimates, not official predictions.
6. Keep a second copy of the exported backup. Progress is stored locally; clearing app data or uninstalling can remove it.

The app intentionally has no Internet permission and bundles its study content. It does not provide cloud sync or cloud backup.
