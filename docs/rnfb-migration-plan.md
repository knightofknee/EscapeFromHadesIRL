# Firebase Web JS SDK → @react-native-firebase — Migration Scope & Audit

> **Status:** Scoping / audit deliverable, 2026-07-08. Not yet started. Produced by a multi-agent audit (inventory, auth, offline-loading, external research, semantics) + adversarial review of the app's Firebase surface.

---

## ⚠️ READ FIRST — corrections from adversarial review (these OVERRIDE the plan body below)

The plan below is accurate on the code surface, but the review caught a wrong claim, a missed de-risk, and a missing precondition. Where these conflict with the plan body, **these win:**

1. **Every signed-in user WILL be logged out on the update — accept it.** The plan's "existing users/tokens carry over, no re-auth" (§2.4.4, §5) is **false.** The current JS SDK persists the session in **AsyncStorage**; RNFB Auth persists in **native Keychain/Android storage**, and there is no bridge between them. On first launch after the swap, native Auth has no session → the app boots signed-out. This is unavoidable (you cannot inject the AsyncStorage token into the native SDK). **No data loss** (data is keyed by uid in the same project) — users just sign in again. Action: make the signed-out boot route cleanly to `(auth)/sign-in` with no error toast, and add a release note. Delete "cold-start restored session without re-login" from the §5 pass criteria.

2. **The iOS build is probably NOT the week-long blocker the plan fears — try the per-pod path first.** `ios/Podfile.properties.json` already has **`"ios.forceStaticLinking": "[]"`** and **`"EXPO_USE_PRECOMPILED_MODULES": "true"`** wired. So the first spike should keep **global dynamic linkage** and add **only** `RNFBApp`, `RNFBAuth`, `RNFBFirestore` to `forceStaticLinking` — statically linking just the RNFB pods and leaving your fragile native stack untouched. Setting global `useFrameworks: "static"` **and** `forceStaticLinking` together (as the plan's §2.2 does) is contradictory — global static already forces everything. **Path A = per-pod static (probably a one-line change). Path B = global `useFrameworks:static` (the plan's version) only as fallback.** This flips risk #1 from "unbounded" to "likely a config line."

3. **New Architecture is ON and unremovable — name it as a precondition.** `android/gradle.properties: newArchEnabled=true`, and iOS is New-Arch by way of RN 0.85.3 + reanimated 4 + nitro-modules + Skia + worklets. You cannot turn it off (those deps require it). The upstream build issues the plan cites (#45484 etc.) are specifically New-Arch + precompiled-core collisions, and `EXPO_USE_PRECOMPILED_MODULES:true` is your **current default** — so the plan's "opt out of precompiled modules as a fallback" means disabling today's default, and that collision is the *first* thing a global-static (path B) build hits. The Step 0 spike must build with New Arch on.

4. **The real static-linkage-fragile pods (if you end up on path B):** `@shopify/react-native-skia`, `react-native-nitro-modules`, `react-native-reanimated@4`, `react-native-worklets`, `react-native-keyboard-controller` — the JSI/C++ pods. Add these to the Step 0 compile check alongside the Live Activity module / MeditationWidget / HealthKit.

5. **Registration is purely additive (downgraded from blocker).** `.env` shows a `:web:` appId — so there is **no** existing native iOS/Android app under this bundle id in the shared project. Adding iOS + Android apps is additive and won't disturb the social app's registrations. Still owner-gated console work, but routine, not risky.

6. **Firestore settings timing:** RNFB persistence is default-on, so **prefer setting nothing.** If you must set `settings()`, it has to run inline in the barrel *above* the `db` export / first use, or RNFB throws "settings after client start."

**Binary-release note:** custom dev build = no OTA. This is a mandatory App Store / Play Store binary update, and per correction #1 every user re-auths on it. Git-revert rollback does **not** un-logout users who already updated (they just log back in, no data loss).

---


_App: EscapeFromHadesIRL · Expo ~56.0.12 / RN 0.85.3 · Target: `@react-native-firebase/app + /auth + /firestore` (Firestore + Auth only)_

---

## 1. Executive Summary

**What this is.** Move the app off the Firebase Web JS SDK (`firebase@^12`, initialized from `EXPO_PUBLIC_*` env vars, memory-only Firestore cache) onto native React Native Firebase (RNFB), which auto-initializes from native config files and ships on-disk offline persistence by default.

**Size.** Medium code surface, high native-build risk. The JS/TS code change is genuinely small because the codebase already funnels ~24 of ~30 Firebase-touching files through a single barrel (`lib/firebase/firestore.ts`) and a single auth wrapper (`lib/firebase/auth.ts`). Most consumer files change by **import path only or not at all**. The real work and the real risk are (a) the iOS `useFrameworks:"static"` native relink against this app's unusual native stack, and (b) on-device re-validation of the offline/loading heartbeat.

**Auth and Firestore must migrate in one atomic pass.** The JS-SDK Firestore client derives `request.auth` from the JS-SDK Auth instance. RNFB Auth runs against the **native** default app — a separate world. If you migrate Auth alone, every rule-protected Firestore read/write returns `permission-denied` and account deletion fails. Do not split them.

**Key risks (ranked):**
1. **[BLOCKER] iOS `useFrameworks:"static"` relinks every pod.** This app has the least-tested-under-static-linkage stack imaginable: a custom Swift Live Activity module (`modules/meditation-activity`), `@bacons/apple-targets` MeditationWidget app-extension, `@kingstinct/react-native-healthkit`, `react-native-health-connect`, `expo-audio`. There are **currently-open** SDK-56/RN-0.85 build breakages (expo/expo#45484, #39607, #45274) that require a custom Podfile `post_install` config plugin. Must be prototyped on a scratch branch before anything else.
2. **[BLOCKER] Native config files absent + shared Firebase project.** No `GoogleService-Info.plist` / `google-services.json` exist; the project is shared with a social app. The owner must register new iOS+Android apps under this app's bundle id in the shared project and download per-app config. Gating, owner-only, console work.
3. **[BLOCKER-if-property] `DocumentSnapshot.exists` method vs property.** Four call sites call `snap.exists()` as a method (`subscribe.ts:68`, `use-notes.ts:48`, `creative-writing.ts:63`, `use-steps-backfill.ts:80`). Historically RNFB exposed `exists` as a **property**; RNFB v22+ modular reportedly aligned to the Web method form. **Must be verified against the exact pinned version's TS types.** `subscribe.ts:68` is on the app-wide offline heartbeat + user-settings listener — if wrong, "settings never load / offline never resolves."
4. **[HIGH] Offline heartbeat depends on RNFB re-emitting a `fromCache:false` metadata-only snapshot** on server confirmation of warm-cache data. If it doesn't refire on device, the 5s timer shows a **false-offline banner while actually online**. Device-only verification, both platforms.

**Go/No-Go preconditions (all must be true before merging):**
- [ ] Scratch-branch prebuild + `run:ios` succeeds with the Live Activity module, MeditationWidget extension, and HealthKit **all compiling** under static frameworks.
- [ ] New iOS + Android apps registered in the shared Firebase project under `com.briancarlisle.escapefromhadesirl`; per-app config files downloaded (social app registrations untouched).
- [ ] Pinned RNFB version confirmed via `npx expo install`; `DocumentSnapshot.exists` method-vs-property resolved against that version.
- [ ] On-device: offline heartbeat flips back to online (no false-offline), and offline write survives force-quit.

**What can only be verified on device:** everything in §5. The build risk (#1) and the offline heartbeat (#4) and `exists()` (#3) cannot be confirmed from source review alone.

---

## 2. Preconditions & Native Setup

### 2.1 Dependencies (do NOT hand-pin from memory)

Per project memory, run `npm view` + `npx expo install --check` first. Then:

```bash
npx expo install @react-native-firebase/app @react-native-firebase/auth @react-native-firebase/firestore
npx expo install expo-build-properties
```

- Latest `@react-native-firebase` line is **25.x** (peer deps are loose: `react:*`, `react-native:*`, `expo:>=47`). Let `expo install` pick the SDK-56-pinned build rather than pinning `25.1.0` by hand.
- **All three RNFB packages must share one version.**
- Keep `firebase@^12` installed until the migration is verified end-to-end (rollback safety), then remove.
- `@react-native-async-storage/async-storage` stays a dep (other features use it); only its use as the auth-persistence shim is dropped.

### 2.2 `app.json` changes

```jsonc
{
  "expo": {
    "ios":     { "googleServicesFile": "./GoogleService-Info.plist" },
    "android": { "googleServicesFile": "./google-services.json" },
    "plugins": [
      "@react-native-firebase/app",
      "@react-native-firebase/auth",
      ["expo-build-properties", {
        "ios": {
          "useFrameworks": "static",
          "forceStaticLinking": ["RNFBApp", "RNFBAuth", "RNFBFirestore"]
        }
      }]
      // ...existing plugins
    ]
  }
}
```

- `forceStaticLinking` **must list every RNFB pod you use** (`RNFBApp`, `RNFBAuth`, `RNFBFirestore`). Omitting one silently breaks the RN 0.84+/Expo prebuilt-core link. **Verify this exact key name against the pinned RNFB docs** — it is version-sensitive.
- There is no separate `@react-native-firebase/firestore` config plugin to add; firestore is covered by the app plugin + `forceStaticLinking`.

### 2.3 The frameworks-linkage risk + resolution (the hard part)

RNFB iOS **requires** `useFrameworks:"static"`, which flips **all** CocoaPods to static-framework linkage — not just RNFB. Known open issues on this exact SDK/RN combo:

| Issue | Symptom | Workaround |
|---|---|---|
| expo/expo#45484 | `Build ExpoModulesJSI xcframework` fails — static linkage doesn't create the `Pods/Headers/Public` dirs `Package.swift` expects | `post_install` symlink hook; fallback: opt out of `EXPO_USE_PRECOMPILED_MODULES` / build RN from source (slower) |
| expo/expo#39607 | RNFB app+auth: "include of non-modular header inside framework module" | `post_install` sets `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES=YES` on RNFB targets |
| expo/expo#45274 | `expo-background-task` breaks static-frameworks build (check if present) | non-modular-include hook |

**Resolution: a small custom Expo config plugin** that injects a Podfile `post_install` block (Expo regenerates the Podfile on every prebuild, so a one-time hand edit won't survive). Statuses on these issues are "accepted" with PRs linked, but treat the workarounds as a **maintained part of the build**, not a one-off.

**Mandatory de-risking step:** prototype on a **throwaway branch** (memory rule: work on the current branch — so create the scratch branch only for the native spike, discard it, then do the real work on `main`). Confirm the Live Activity module, MeditationWidget extension, HealthKit, and expo-audio all compile before committing to the migration.

Prebuild command (memory: LANG prefix avoids the CocoaPods Unicode crash):
```bash
LANG=en_US.UTF-8 npx expo prebuild --clean
npx expo run:ios
```

### 2.4 Firebase console steps — OWNER must do (cannot be done from code)

1. In the **shared** Firebase project, add a **new iOS app** with bundle id `com.briancarlisle.escapefromhadesirl` and a **new Android app** with package `com.briancarlisle.escapefromhadesirl`. (The social app almost certainly registered different ids — do **not** reuse its config files.)
2. Download `GoogleService-Info.plist` (iOS) and `google-services.json` (Android); commit them at repo root.
3. Verify **Auth → Sign-in providers**: Google provider lists the existing OAuth client IDs (`GOOGLE_IOS_CLIENT_ID` / `GOOGLE_CLIENT_ID`) as authorized; Apple provider enabled (Services ID / key). These work today via JS SDK, but RNFB validates against the same backend, so confirm.
4. Same `projectId`/`authDomain` (from the new plist) ⇒ **existing users, tokens, and Firestore data all carry over.** No user re-auth, no data migration. The MeditationWidget extension does **not** need its own Firebase app (it doesn't call Firebase).

---

## 3. Ordered Migration Steps

Sequenced so the app builds/tests at each checkpoint. **Barrel-first strategy is viable and recommended** — but note the barrel swap cannot be validated in isolation because native config + prebuild are prerequisites. So step 0 (native) truly comes first.

### Step 0 — Native spike (scratch branch, throwaway)
- **Change:** install RNFB deps, add config plugin + `useFrameworks:static`, drop placeholder config files, prebuild, `run:ios` + `run:android`.
- **Files:** `app.json`, custom `post_install` config plugin, config files.
- **Verify:** iOS build compiles with Live Activity + MeditationWidget + HealthKit; Android builds. **If this fails, STOP — the migration is not go.** Discard scratch branch.

### Step 1 — Native config + deps land on `main`
- **Change:** real `GoogleService-Info.plist` + `google-services.json` (from §2.4), deps, `app.json`, config plugin.
- **Verify:** `expo prebuild` clean; app still launches on the old JS SDK (nothing imports RNFB yet).

### Step 2 — Firestore barrel swap (the bulk of the surface)
- **Change:** in `lib/firebase/firestore.ts`, repoint the single import line from `firebase/firestore` → `@react-native-firebase/firestore`, keeping every re-exported name identical (`getFirestore/collection/doc/setDoc/updateDoc/getDoc/getDocs/deleteDoc/deleteField/query/where/orderBy/limit/onSnapshot/writeBatch`, `db = getFirestore(app)`). Fold the three stray direct imports into the barrel: add `deleteField` to what `habits-context.tsx:12` and `quests-context.tsx:12` import from the barrel; import `collection` in `vacation-days.ts:2` from the barrel.
- **Change (persistence):** apply RNFB Firestore settings **once at module load, before any listener mounts**. Two candidate APIs — **verify which the pinned version wants**:
  - `settings({ persistence: true, cacheSizeBytes: CACHE_SIZE_UNLIMITED })`, or
  - modular `initializeFirestore(getApp(), { persistence: true, cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED })`.
  - Persistence is **on by default** in RNFB, so this is explicit-confirmation, not strictly required. Settings cannot change after the client starts — the barrel is the correct single place.
- **Files:** `lib/firebase/firestore.ts`, `contexts/habits-context.tsx`, `contexts/quests-context.tsx`, `lib/vacation-days.ts`. All ~24 pure-barrel consumers change by **nothing**.
- **Verify:** app builds; reads/writes work **while still on JS-SDK auth** (they will, because in this interim both SDKs are signed into the same native project once auth migrates — so more realistically, do Step 3 in the same PR; see the atomicity note). Practically, Steps 2+3 ship together.

### Step 3 — Auth swap (same PR as Step 2 — atomic)
- **Change `lib/firebase/auth.ts`:** imports `firebase/auth` → `@react-native-firebase/auth`. Delete `initializeAuth`, the `getReactNativePersistence(AsyncStorage)` block, the `require('@firebase/auth')` Metro-condition hack, and the `AsyncStorage` + `Persistence` type imports. Replace with `export const auth = getAuth();` (no app arg — native default app). Keep every exported function body near-identical: `signInWithEmailAndPassword/createUserWithEmailAndPassword/signOut/onAuthStateChanged/signInWithCredential/reauthenticateWithCredential/EmailAuthProvider/GoogleAuthProvider.credential/sendPasswordResetEmail` all exist in RNFB modular.
  - **Apple credential signature changes:** `new OAuthProvider('apple.com').credential({ idToken, rawNonce })` → `AppleAuthProvider.credential(idToken, rawNonce)` (**positional args, not an object** — the one non-mechanical auth change). Import `AppleAuthProvider`, drop `OAuthProvider`.
  - `AUTH_ERROR_MESSAGES` map (auth.ts:89-100) needs **no change** — RNFB auth error codes are the identical `auth/...` strings.
  - `primaryProviderId` reading `user.providerData[0].providerId` works unchanged.
- **Change `lib/firebase/account-deletion.ts`:** import `deleteUser` + `User` from `@react-native-firebase/auth`; `User` → `FirebaseAuthTypes.User`. `reauthenticateWithCredential(user, cred)` and `deleteUser(user)` unchanged; `auth/requires-recent-login` handling unchanged.
- **Change type-only sites:** `contexts/auth-context.tsx:2` and `app/_layout.tsx:42` — `type User` from `firebase/auth` → `FirebaseAuthTypes.User` from `@react-native-firebase/auth`. `onAuthStateChanged` returns an unsubscribe fn identically; `user.uid` present.
- **Delete after full swap:** `lib/firebase/app.ts` and the `EXPO_PUBLIC_FIREBASE_*` env config become fully dead (both auth and firestore now use the native default app). `getAuth()`/`getFirestore()` take it implicitly.
  - **Verify no remaining importer of `app.ts`** before deleting; if `getFirestore(app)` in the barrel still references it, switch to `getFirestore()` / `getApp()`.
- **Files:** `lib/firebase/auth.ts`, `lib/firebase/account-deletion.ts`, `contexts/auth-context.tsx`, `app/_layout.tsx`, delete `lib/firebase/app.ts`. Consumers `sign-in.tsx`, `sign-up.tsx`, `settings/index.tsx`, `additional-settings.tsx`, `constants/google-oauth.ts` need **no change** (they ride the wrapper; OAuth token layer is SDK-independent).
- **Verify (device):** email sign-in/up, Google sign-in, Apple sign-in, sign-out, cold-start session restore, password reset, account deletion incl. `requires-recent-login` reauth.

### Step 4 — `exists()` reconciliation
- **Change:** verify the pinned RNFB version's `DocumentSnapshot.exists`. If **property**: change `snap.exists()` → `snap.exists` at `use-notes.ts:48`, `creative-writing.ts:63`, `use-steps-backfill.ts:80`, and `snapshot.exists?.()` → `snapshot.exists` at `subscribe.ts:68`. If **method** (v22+ alignment): leave as-is. Note `snapshot.exists?.()` is **not** protected by optional chaining against the property case — a boolean isn't nullish, so `false?.()` still throws.
- **Verify (device):** open a note, run steps backfill, hit the creative-writing read path; confirm user-settings + offline listeners resolve (they call this on every snapshot).

### Step 5 — Verify `subscribe.ts` listener semantics (no code change expected)
- **Change:** none intended. Confirm on device that RNFB accepts the 4-arg `onSnapshot(ref, { includeMetadataChanges:true }, onNext, onError)` positional-options form (subscribe.ts:56-96 — the only call site using an options object). If it misbehaves, fall back to the observer-object form. Every other listener uses plain `onSnapshot(ref, onNext[, onError])` and is fine. `metadata.fromCache/hasPendingWrites`, `snapshot.empty`, `docChanges()`, `snapshot.docs`, `QueryDocumentSnapshot.ref/.id/.data()` all have RNFB parity.
- **Verify (device):** the offline heartbeat (see §5) — the highest-value check.

### Step 6 — Remove `requireOnline()` write blocking, re-validate loading
- **Change:** durable disk persistence makes queued writes survive force-quit, so the write-blocking guards are now overly conservative. **Lowest-risk mechanic:** don't delete the ~13 call sites — make `offline-context.requireOnline()` **always return true** (non-blocking), so the typed early-returns (`return` / `return false` / `return null` / `return ''`) never fire and writes proceed and durably queue. Keep the symbol so nothing else changes.
  - Write sites affected: `records-context.tsx:206` (core daily record — highest priority), `habits-context.tsx:123/142/165`, `quests-context.tsx:103/123/138`, `notes-context.tsx:329/430/459`, `user-settings-context.tsx:113/122/131`, `use-tags.ts:41`, `use-checklist-items.ts:205/230/282/298/313/344/365`, `vacation-edit-modal.tsx:89/108`, `tile-settings.tsx:281`.
- **KEEP:** the read-side `isOffline` flag, the 5s heartbeat, and all empty-state "No internet" messaging (habits index:319, stats:321, month:207, week:169, revive-habit:43, notes index:230, notes [id]:515). With a warm cache these rarely trigger.
- **Constraint:** once `requireOnline` stops blocking, the deduped write-time `Alert` (offline-context.tsx:64-68) no longer fires; `isOffline` becomes the only offline signal. **Any offline warning-modal must be informational only** — if it's a confirm dialog that gates the write, you've re-introduced exactly the block you removed and defeated durable offline writes.
- **Files:** `contexts/offline-context.tsx` (make `requireOnline` a no-op true).
- **Verify (device):** the force-quit durability test in §5 — the claim the whole change rests on.

---

## 4. File-by-File Change Table

| File | Change | Risk |
|---|---|---|
| `lib/firebase/firestore.ts` | Repoint barrel import `firebase/firestore` → `@react-native-firebase/firestore`; keep all re-export names; apply persistence settings at module load | Medium |
| `lib/firebase/auth.ts` | Imports → `@react-native-firebase/auth`; delete `initializeAuth`+persistence shim+require hack; `getAuth()`; Apple cred → `AppleAuthProvider.credential(idToken, rawNonce)` (positional); `User`→`FirebaseAuthTypes.User` | Medium |
| `lib/firebase/app.ts` | **Delete** (native default app auto-inits; env vars dead) — after confirming no importer | Medium |
| `lib/firebase/account-deletion.ts` | Import `deleteUser`+`User` from RNFB auth; `User`→`FirebaseAuthTypes.User`; firestore side rides barrel | Medium |
| `lib/firebase/subscribe.ts` | Type imports (`DocumentReference/FirestoreError/Query/Unsubscribe`) + `onSnapshot` from RNFB; verify 4-arg options form; `exists?.()` per Step 4 | Medium |
| `contexts/auth-context.tsx` | `type User` → `FirebaseAuthTypes.User`; logic unchanged | Low |
| `app/_layout.tsx` | `type User` → `FirebaseAuthTypes.User`; `user.uid` unchanged | Low |
| `contexts/habits-context.tsx` | `deleteField` from barrel instead of direct `firebase/firestore` | Low |
| `contexts/quests-context.tsx` | `deleteField` from barrel | Low |
| `lib/vacation-days.ts` | `collection` from barrel | Low |
| `contexts/offline-context.tsx` | `requireOnline()` → always-true no-op; keep `isOffline`/heartbeat | Medium |
| `hooks/use-notes.ts` | `exists()`→`exists` **iff** RNFB uses property form (Step 4) | Blocker-if-property |
| `lib/creative-writing.ts` | same as above (line 63) | Blocker-if-property |
| `hooks/use-steps-backfill.ts` | same as above (line 80) | Blocker-if-property |
| `app.json` | `ios/android.googleServicesFile`; plugins `@react-native-firebase/app`+`/auth`+`expo-build-properties(useFrameworks:static, forceStaticLinking)` | Medium |
| _new_ custom config plugin | Podfile `post_install`: `CLANG_ALLOW_NON_MODULAR_INCLUDES...=YES` + possible header symlink (issues #39607/#45484) | Blocker (native) |
| `GoogleService-Info.plist`, `google-services.json` | New files from shared project registration | High (owner) |
| `package.json` | Add RNFB deps; remove `firebase@^12` after verification | Low |
| **Ride the barrel — NO edits** | `records-context.tsx`, `notes-context.tsx`, `user-settings-context.tsx`, `hooks/use-habits.ts`, `use-tags.ts`, `use-checklist-items.ts`, `use-records-snapshot.ts`, `lib/persist-record.ts`, `lib/firebase/checklist-items.ts`, `app/export-notes.tsx`, `sign-in.tsx`, `sign-up.tsx`, `settings/index.tsx`, `additional-settings.tsx`, `constants/google-oauth.ts` | None (verify only) |

**No-change semantics (confirmed parity, do NOT "fix"):** `deleteField()` (RNFB modular alias of `FieldValue.delete()`); no Timestamp coercion (all timestamps are `Date.now()` numbers — the #1 RNFB gotcha is avoided entirely); `writeBatch` 500-op cap identical; `getDocs` plain form (no `source`/`GetOptions` used); subcollection refs `collection(db,'notes',id,'items')` and `collection(docSnap.ref,'items')` both supported; `getDoc` on missing doc resolves (not throws); auth error codes identical `auth/...` strings.

**Optional hardening (do NOT bundle with this migration):** chunk `vacation-days.ts` batches at 450 like `checklist-items.ts` (a >500-day span would exceed the cap on RNFB and current Web alike). Also: later, read the 18-month quest window with `source:'cache'` after first sync to cut billed reads — defer (changes cross-device freshness).

---

## 5. Behavioral Re-validation Checklist (ON DEVICE — iOS **and** Android)

These cannot be verified from source. The offline/loading heartbeat is the highest-value target.

- [ ] **Cold start, warm cache:** kill app → relaunch → habits/records/notes appear **instantly** from disk cache (first `fromCache:true` snapshot now carries real data). No spinner hang, no flash of offline empty-state over real cached data.
- [ ] **Cold start, first install / cache-miss:** empty-`fromCache` suppression + 5s timeout still resolves the loading gate (should behave as before).
- [ ] **Offline heartbeat recovery (CRITICAL):** go offline → confirm offline banner appears after ~5s → go back online → confirm banner clears (`seenServer` flips on the server-ack `fromCache:false` metadata refire). **If it stays "offline" while online, RNFB isn't refiring the metadata event — investigate before shipping.**
- [ ] **No false-offline:** on a normal online launch with warm cache, the banner must **not** appear (the `&& !isOffline` LoadingScreen branch must not wedge).
- [ ] **Offline write survives app-kill (the whole point):** go offline → tap-record a habit → force-quit → relaunch (still offline) → confirm the record is present → go online → confirm it syncs to the server.
- [ ] **Quest scoring reads offline:** offline → open quests → `getDocs` in `use-records-snapshot.ts` resolves from disk cache incl. this device's pending writes (`hasPendingWrites`) instead of empty/catch path.
- [ ] **Auth:** email sign-in/up; Google sign-in; Apple sign-in (positional-cred path); sign-out; **cold-start restored session** loads without re-login; password reset email.
- [ ] **Account deletion:** full `deleteAccountAndData` sweep (parallel `getDocs` + serial 500-batch flush incl. checklist-items subcollection) → `requires-recent-login` reauth path for email, Google, and Apple providers.
- [ ] **Doc-read paths (`exists`):** open a note, run steps backfill, trigger creative-writing read; user-settings + offline listeners resolve every snapshot without `exists is not a function`.
- [ ] **Notes two-listener merge:** window+pinned merge (pinned sidecar `notes-context.tsx:291` uses raw `onSnapshot`, `includeMetadataChanges` off) doesn't double-fire under persistence.
- [ ] **Native stack smoke test:** Meditation Live Activity starts/updates; MeditationWidget renders; HealthKit steps + Health Connect still read; custom notification sounds play — all under static-framework linkage.

---

## 6. Rollback Plan

**Cheap rollback exists** because this is a native+import change, not a data migration — the Firestore data and user accounts are untouched (same project).

- **Before merge:** all native/RNFB work is on the branch; `main`'s JS-SDK build is intact. Keep `firebase@^12` and `lib/firebase/app.ts` + env vars in place until §5 fully passes; only remove them in a follow-up cleanup commit.
- **Git rollback:** revert the migration commit(s), restore `app.json` (remove RNFB plugins + `useFrameworks:static`), `LANG=en_US.UTF-8 npx expo prebuild --clean`, rebuild. Because no data schema changed, reverting the client fully restores prior behavior.
- **Partial fallback within RNFB:** if the offline heartbeat misbehaves, you can force **memory cache** (`persistence:false`) to reproduce the old memory-only semantics and keep `requireOnline` blocking (skip Step 6) — buys time without reverting the whole migration.
- **Native build fallback:** if `useFrameworks:static` breaks a pod you can't patch via `post_install`, opt out of `EXPO_USE_PRECOMPILED_MODULES` (build RN from source, slower) as an escape hatch. If unresolvable, this is the trigger to abort (revert).
- **Do NOT** delete `GoogleService-Info.plist`/`google-services.json` or the Firebase console app registrations on rollback — they're harmless to leave and re-registering is owner-gated.

---

## 7. Open Questions for the Owner

1. **Confirm the target is RNFB native**, not the Web SDK's `persistentLocalCache()`. This plan assumes `@react-native-firebase/*`. (Web modular IndexedDB persistence is unreliable on RN.)
2. **Console access & registration:** who registers the new iOS + Android apps in the shared Firebase project under `com.briancarlisle.escapefromhadesirl`, and can we confirm this won't disturb the social app's existing registrations? Are apps under those exact ids maybe already registered?
3. **Verify auth provider config in the shared project:** Google provider lists `GOOGLE_IOS_CLIENT_ID`/`GOOGLE_CLIENT_ID` as authorized; Apple provider enabled. (Works today via JS SDK, but confirm since RNFB validates the same backend.)
4. **Pinned RNFB version** — needed to definitively answer the **`DocumentSnapshot.exists` method-vs-property** question against that version's TS types. This is the single highest-risk code item; do not trust doc-read paths until answered. **Marked to verify on device.**
5. **Offline heartbeat on device** — does RNFB (persistence + `includeMetadataChanges:true`) re-emit a `fromCache:false` metadata-only snapshot on server confirmation of unchanged warm-cache data, on **both** iOS and Android? The false-offline banner risk hinges on this. **Marked to verify on device.**
6. **`onSnapshot` 4-arg positional-options form** — confirm RNFB accepts `onSnapshot(ref, {includeMetadataChanges:true}, onNext, onError)`; observer-object form is the fallback. **Marked to verify on device.**
7. **`requireOnline` disposition:** keep as an always-true no-op symbol (recommended, lowest-risk, leaves ~13 call sites intact) or fully delete? And what exactly is the "offline warning-modal plan"? It **must** be informational/non-blocking.
8. **`forceStaticLinking` key** — confirm the exact key name/shape against the pinned RNFB + expo-build-properties docs; it is version-sensitive and a wrong/missing entry silently breaks the iOS link.
9. **Podfile `post_install` config plugin** — does the team accept maintaining a custom plugin (`CLANG_ALLOW_NON_MODULAR_INCLUDES` + possible header symlinks) as a permanent build artifact, since Expo regenerates the Podfile every prebuild?
10. **Static-frameworks validation of the fragile pods** — explicit sign-off that the scratch-branch spike must green-light the Live Activity module + MeditationWidget extension + HealthKit before the migration is "go."

---

### Honest effort assessment
The **code** is ~1–2 focused days (barrel + auth wrapper are single swap points; most files don't change). The **native build** (`useFrameworks:static` against this specific stack, with currently-open upstream issues requiring a maintained `post_install` patch) is the unbounded risk and could consume anywhere from a day to a week, or prove blocking. The **on-device re-validation** (§5, both platforms) is non-negotiable and is where the memory-vs-disk persistence behavioral changes surface. Do the native spike (Step 0) first — it is the true go/no-go gate.
---

## Appendix: full adversarial review (raw)

I verified the plan's claims against the actual repo. The plan is unusually thorough and mostly technically correct on the code surface (barrel swap, `exists()` sites, Apple positional-cred, atomicity reasoning). But it has one flatly-wrong claim, misses New Architecture entirely, and overstates its central blocker while ignoring a de-risk mechanism the repo already has wired up. Top gaps, ranked:

---

## 1. [WRONG — CORRECTNESS] "Existing users carry over, no re-auth" is false. Every signed-in user WILL be logged out.
**Plan says** (§2.4.4, and §5 checklist "cold-start restored session loads without re-login"): same projectId ⇒ "existing users, tokens... all carry over. No user re-auth."

**Why it's wrong:** The current JS SDK persists the session in **AsyncStorage** (`auth.ts:24-30`, `getReactNativePersistence(AsyncStorage)`). RNFB Auth persists in **native storage** (iOS Keychain / Android native), managed by the native Firebase SDK. There is no bridge between the two stores. On the first launch after the swap, native Auth has **no session** → `onAuthStateChanged` fires `null` → the app boots to signed-out. This is the same reason the plan correctly argues auth+firestore must be atomic (native `request.auth` is empty until the user signs in on native). So the plan's own atomicity logic contradicts its "no re-auth" claim.

**Impact:** 100% of the existing installed base is logged out on the update. No data loss (data is keyed by `uid` in the same project), but the §5 checkbox "restored session without re-login" **fails by design** on first post-migration launch and must be removed as a pass criterion.

**Fix:** Treat forced re-auth as expected. Make sure the signed-out boot path routes cleanly to `(auth)/sign-in` and does **not** surface an error/toast. Add a release note. There is no viable "session migration" — you cannot inject the AsyncStorage token into the native SDK. Accept re-login.

## 2. [DE-RISK THE BLOCKER] Global `useFrameworks:"static"` is likely avoidable — the repo already has the per-pod escape hatch.
**Plan's Blocker #1** makes global static frameworks (relinking Skia, nitro, reanimated, Live Activity, HealthKit, etc.) the centerpiece risk. But `ios/Podfile.properties.json` already contains **`"ios.forceStaticLinking": "[]"`** and **`"EXPO_USE_PRECOMPILED_MODULES": "true"`**. That `forceStaticLinking` key (which the plan flagged as "verify the name" — it's real) is exactly the mechanism to statically link **only** `RNFBApp/RNFBAuth/RNFBFirestore` while leaving the rest of the native stack on the existing dynamic linkage.

**Why it matters:** The plan's whole "least-tested-under-static-linkage stack imaginable" blocker mostly evaporates if you *don't* flip the global switch. Setting `useFrameworks:"static"` AND `forceStaticLinking` together (as the plan's §2.2 does) is contradictory — global static already forces everything static, making the per-pod list meaningless.

**Fix:** Spike **path A first**: keep dynamic global linkage + `EXPO_USE_PRECOMPILED_MODULES:true`, put only the three RNFB pods in `forceStaticLinking`. Only fall back to global `useFrameworks:static` (path B, the plan's plan) if RNFB refuses to link statically-scoped. This inverts the risk from "unbounded, could take a week" to "probably a config-line change."

## 3. [UNADDRESSED] New Architecture is ON — the plan never mentions it, and it's the amplifier for every build issue it lists.
`android/gradle.properties: newArchEnabled=true`; iOS is New Arch by virtue of RN 0.85.3 + `react-native-reanimated@4.3.1` + `react-native-nitro-modules@0.35.9` + `@shopify/react-native-skia@2.6.2` + `react-native-worklets`. The open issues the plan cites (#45484 especially) are **New-Arch + precompiled-core** breakages. Critically, `EXPO_USE_PRECOMPILED_MODULES:true` is **currently enabled** — so the plan's "opt out of precompiled modules as a fallback" is describing disabling the *current default*, and the #45484 collision is the **first** thing a global-static build hits, not a fallback edge case.

**Fix:** Name New Arch explicitly as a precondition; the spike must build with New Arch on (it can't be turned off without breaking reanimated4/nitro/skia). Decide the precompiled-modules disposition up front, not as a fallback.

## 4. [INCOMPLETE INVENTORY] The "fragile pods" list omits the actually-fragile ones.
Plan's spike gate names Live Activity, MeditationWidget, HealthKit, expo-audio. It omits the JSI/C++ pods that are the most static-framework-sensitive: **`@shopify/react-native-skia@2.6.2`, `react-native-nitro-modules@0.35.9`, `react-native-reanimated@4.3.1`, `react-native-worklets@0.8.3`, `react-native-keyboard-controller@1.21.6`**. If you end up on global static (path B), these are the ones most likely to throw duplicate-symbol / non-modular-header errors. Add them to the Step 0 go/no-go compile check.

## 5. [SEQUENCING] Step 1's "app still launches on old JS SDK" checkpoint understates that Step 1 *is* the native cutover.
The moment RNFB pods (and any linkage change) land, the whole app's native build changes — before a single JS file imports RNFB. So the real native go/no-go happens at Step 1 and ships to `main` while JS is still on the web SDK. That's fine as risk isolation, but the "clean checkpoint" only exists **if the static build already succeeds** — i.e., Step 0 and Step 1 are the same risk, and Step 0 being a throwaway branch doesn't reduce Step 1's exposure. Also worth stating explicitly (the plan implies but never confirms): during the Step 1→2 interim, the JS SDK (pure-JS, `firebase/app` from env) and native RNFB coexist with **no native symbol clash** (the web SDK links nothing native) — so the interim is safe. Confirm that assumption in the plan so nobody panics about "two Firebase SDKs."

## 6. [VERIFY, minor] Confirm the existing Firebase registration type — it's a **web** app.
`.env: EXPO_PUBLIC_FIREBASE_APP_ID` is a `:web:` appId, and `projectId=escape-from-hades-irl`. Good news: this *confirms* the plan's §2.4 "register new iOS + Android apps" is correct (no existing native iOS app under this bundle id, so no bundle-id-uniqueness conflict). The plan's worry about "disturbing the social app" is unfounded for the registration itself — adding iOS/Android apps is purely additive. Downgrade §7-Q2 from blocker to routine.

---

## Where the plan is CORRECT (don't second-guess these):
- **Atomic auth+firestore** — right, and my finding #1 reinforces it.
- **`exists()` sites** — verified exactly 4 firestore sites: `subscribe.ts:68`, `use-notes.ts:48`, `creative-writing.ts:63`, `use-steps-backfill.ts:80`. `lib/export/file-saver.ts:10` (`exportDir.exists`) is expo-file-system and correctly excluded. The note that `snapshot.exists?.()` optional-chaining does **not** protect the property case (`false?.()` still throws) is a genuine, correct catch.
- **Apple positional credential** is the one real auth code change; **Google `credential(idToken)`** one-arg is genuinely unchanged in RNFB. **Error-code map** (`auth.ts:89-100`) unchanged — correct.
- **No Timestamp/serverTimestamp** anywhere → the #1 RNFB migration gotcha is genuinely avoided.
- **`requireOnline` no-op** (`offline-context.tsx:60-71`) is a clean, low-risk mechanic; the "informational-only modal" constraint is the right guardrail.
- **Memory→disk cache** behavioral shift and the offline-heartbeat re-fire risk (`subscribe.ts:79-89`, depends on RNFB re-emitting `fromCache:false` metadata-only) are correctly identified as device-only unknowns.

## Two additions to the checklist the plan should carry:
- **Binary-release coordination:** custom dev build = no OTA. This is a mandatory App Store / Play binary update, and combined with #1 every user re-auths on update. The git-revert rollback (§6) does **not** un-logout users who already updated — state that (they just re-login, no data loss).
- **Firestore settings timing:** the barrel calls `getFirestore(app)` at module eval and `offline-context` subscribes on mount, so any `settings({persistence,cacheSizeBytes})` must execute inline in the barrel *above* the `db` export / first use. Since RNFB persistence is default-on, prefer skipping explicit settings entirely to avoid a "settings after client start" throw.

Evidence files: `lib/firebase/auth.ts:24-30`, `lib/firebase/firestore.ts:18-20`, `lib/firebase/subscribe.ts:56-89`, `lib/firebase/app.ts`, `contexts/offline-context.tsx:60-71`, `ios/Podfile.properties.json` (forceStaticLinking + EXPO_USE_PRECOMPILED_MODULES), `android/gradle.properties` (newArchEnabled=true), `.env` (web appId), `app.json` (no useFrameworks currently set; New-Arch-implying deps in package.json).