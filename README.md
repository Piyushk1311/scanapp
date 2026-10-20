# ScanPro — iOS document scanner (CamScanner-style)

Native SwiftUI app, iOS 16+. No third-party dependencies.

## Features
- Camera scanning with auto edge detection, perspective correction, multi-page (VisionKit)
- Library with thumbnails, search by name **and scanned text**, swipe to delete
- Per-page editor: Enhance / Grayscale / B&W filters, rotate, delete
- Add more pages to an existing document, rename
- On-device OCR (Vision) with copy-to-clipboard
- Export/share as PDF or images (AirDrop, Files, Mail, Print, ...)

## Build (requires a Mac with Xcode 15+)
```bash
brew install xcodegen
cd ScanPro
xcodegen generate     # creates ScanPro.xcodeproj from project.yml
open ScanPro.xcodeproj
```
In Xcode: select the ScanPro target → Signing & Capabilities → pick your Team, then run on a
**physical iPhone/iPad** (the document camera does not work in the Simulator).

Change `bundleIdPrefix` / `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml` before shipping.

## Layout
- `Models/` – `ScanDocument`
- `Services/` – `DocumentStore` (file storage), `ImageFilters`, `OCRService`, `PDFExporter`
- `Views/` – `LibraryView`, `ScannerView`, `DocumentDetailView`, `PageEditorView`

## Ideas for next steps
iCloud sync, manual crop adjustment, searchable (text-layer) PDFs, page reordering, passcode/Face ID lock, ID-card mode.

## Web app (works on any iPhone/Android, no install or signing)
`web/` is an installable PWA version of ScanPro: camera/gallery import, auto edge detection + manual crop,
filters, OCR, PDF export (Save to Files / Share), and a 6‑digit PIN. Scans are encrypted on-device
(AES‑GCM, key derived from the PIN with PBKDF2) and never leave the phone; all libraries are bundled (no CDN).
Open the site, then Share → *Add to Home Screen*. Run locally with any static server, e.g. `npx serve web`.
