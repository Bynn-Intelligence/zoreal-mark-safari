# App Store listing

Safari extensions ship inside an app, so the listing is an App Store listing: one app
record under the company's Apple Developer team, sold at no cost, one purchase covering
Mac, iPhone and iPad. The first upload is made from Xcode; the steps are at the end.

## App record (App Store Connect)

Created 2026-09-09 under the company's team, App Store Connect app id `6810429958`. The
name, subtitle, privacy policy URL, category, age rating and the English version text
below were set through the App Store Connect API the same day; what remains in the
form is pricing (free), the App Privacy answers, the review contact, the screenshots,
and the builds.

- **Name:** ZOREAL Mark
- **Bundle id:** `com.zoreal.mark` (the extension is `com.zoreal.mark.Extension`)
- **Primary language:** English (U.S.)
- **SKU:** `zoreal-mark`
- **Platforms:** macOS and iOS, one record, Universal Purchase
- **Primary category:** Utilities. On the Mac App Store the app also appears under the
  Safari Extensions collection because it carries one.
- **Price:** free, all territories
- **Age rating:** 4+ (nothing to declare)
- **Export compliance:** `ITSAppUsesNonExemptEncryption` is `false` in both Info.plists:
  the app uses HTTPS and the standard algorithms of the platform (AES-GCM, HMAC, ECDSA
  verification), which are exempt.

## Version information

- **Subtitle** (30 characters at most): Proof a real human vouched
- **Promotional text** (170 at most): A Mark is proof, not a likelihood. See which posts a
  real human, verified by ZOREAL, stands behind, on any site, and sign what you write.
- **Description:** the plain-text description in the Chrome listing
  (`store/chrome-web-store.md` in zoreal-mark-chrome), with its "Permissions, in plain
  words" paragraph replaced by: "Safari asks you to allow the extension on websites.
  Allow it on every website, so it can verify a Mark wherever one appears; it reads
  pages to find Marks and draws a badge beside each, nothing else." App Store
  descriptions allow 4,000 characters, so the Chrome text is trimmed to the sections
  What a Mark looks like, What the extension does, Sign what you write, You need ZOREAL
  ID, What a Mark says and does not, Privacy, About ZOREAL.
- **Keywords** (100 characters at most): verified human,signature,provenance,
  authenticity,proof,identity,ZOREAL,mark,sign,vouch
- **Support URL:** `https://github.com/Bynn-Intelligence/zoreal-mark-safari/issues`
- **Marketing URL:** `https://zoreal.com/product/mark`
- **Privacy policy URL:** `https://zoreal.com/privacy/mark-extension`
- **Copyright:** Bynn Intelligence, Inc.

## App privacy

Answered per what the extension sends, consistent with the privacy notice:

- **Data collected:** Browsing History (the address of the page the user signs for) and
  User Content (the text the user signs, sealed so the service cannot read it). Both:
  used for App Functionality, not linked to the user's identity, not used for tracking.
- **Not collected:** everything else. Verifying sends nothing about the reader.
- **Tracking:** none.

## Review notes

```text
No account or credentials are needed. The app carries a Safari web extension; open the app once, then enable the extension in Safari and allow it on all websites. Verification runs on any page that carries a ZOREAL Mark: the README at https://github.com/Bynn-Intelligence/zoreal-mark-safari contains example Marks that render each verdict once the extension is enabled. Signing requires the ZOREAL ID app on a phone and is not needed to review verification. The extension loads no remote code and sends nothing about the user; the privacy notice at https://zoreal.com/privacy/mark-extension describes the two requests it makes.
```

## Screenshots

- **Mac:** 1280 x 800 (or 1440 x 900, 2560 x 1600, 2880 x 1800); the three in
  `store/screenshots/` were taken in Chrome and are placeholders, to be retaken in
  Safari before submission because the toolbar and popup frame differ.
- **iPhone:** 6.9 inch (1320 x 2868) required; 6.5 inch optional. **iPad:** 13 inch
  (2064 x 2752). To be taken on devices once the iOS run is proven.

## Assets

- **App icon:** rendered into `Assets.xcassets/AppIcon.appiconset` by
  `scripts/make-app-icons.mjs`; App Store Connect reads the 1024 px one from the build.

## Building and uploading

1. `npm run build:safari` (a release build, pointed at the record service).
2. Open `apple/ZOREAL Mark/ZOREAL Mark.xcodeproj` in Xcode, signed in to the team.
   Signing is automatic; the team id is in the project.
3. Bump `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` on all four targets to the
   extension's version and a build number higher than the last upload.
4. Product > Archive with the macOS scheme, then Distribute App > App Store Connect >
   Upload. Repeat with the iOS scheme (a Generic iOS Device destination).
5. In App Store Connect, attach both builds to the version, fill in the fields above,
   and submit for review. TestFlight is available for both once the builds are
   processed.

A CI upload needs the distribution certificate and the App Store Connect API key as
repository secrets; until then the archive is made by hand.
