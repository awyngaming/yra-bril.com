# YRARBIL: QR-based library system

A small, dependency-free prototype of a library where members log in by scanning a QR member card, and borrow or return books by scanning the QR label on each book. It runs entirely in the browser (plain HTML, CSS and JavaScript) and stores its data in `localStorage`.

## Features

- **QR login and logout:** scan your member card to log in, scan it again to log out.
- **Borrow and return by scan:** scan a free book to borrow it, scan one you hold to return it.
- **Sign up:** enter a name and get a personal QR member card.
- **Catalog and loans:** search books, see due dates, renew once, overdue highlighting.
- **Librarian view:** all loans, activity log, printable member cards, add books.
- **Camera, photo or typed code:** live camera scanning, "Scan from photo" (opens your gallery), or type a code.

## QR code format

| Type   | Format                                  | Example         |
| ------ | --------------------------------------- | --------------- |
| Member | letters of the name + 4 random hex      | `ANGELOCASTOR-7F3A` |
| Book   | first letters of the title + book number | `HOBBIT-0005`   |

## Demo cards

Open the app and use the "Simulate scan" buttons, or scan the QR codes shown on screen.

| Name       | Role      | Code             |
| ---------- | --------- | ---------------- |
| Angelo Castor  | member    | `ANGELOCASTOR-7F3A`  |
| Junalyn Nebria  | member (has an overdue book) | `JUNALYNNEBRIA-B20C` |
| Joshua Magalo | librarian | `JOSHUAMAGALO-AD11` |

## Run locally

Camera access needs HTTPS or `localhost`, so serve the folder instead of opening the file directly:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy with GitHub Pages (free HTTPS)

1. Push this folder to a GitHub repository (see below).
2. In the repository go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, then save.
4. After a minute your site is live at `https://<your-username>.github.io/<repository-name>/`.

## Upload to GitHub

**Using the website:** create a new repository, click **Add file > Upload files**, drag in everything from this folder (not the folder itself), and commit.

**Using git:**

```bash
git init
git add .
git commit -m "Add YRARBIL QR library prototype"
git branch -M main
git remote add origin https://github.com/<your-username>/<repository-name>.git
git push -u origin main
```

## Project structure

```
index.html   page structure, loads the libraries, styles and script
style.css    all styling (light and dark themes)
script.js    data, scan logic, camera, views and events
LICENSE      MIT license
README.md    this file
```

## Limitations (read before real use)

This is a prototype. Data lives in each visitor's own browser, so members and loans are not shared between devices. Anyone who has a member's QR code can log in as that member, so a real system needs a backend, server-side checks, and ideally a PIN or short-lived rotating codes.

## Third-party libraries (loaded from cdnjs)

- [qrcodejs](https://github.com/davidshimjs/qrcodejs), MIT license, generates QR codes.
- [html5-qrcode](https://github.com/mebjas/html5-qrcode), Apache 2.0 license, scans QR codes.

## License

MIT, see [LICENSE](LICENSE).
