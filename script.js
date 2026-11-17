// =====================================================================
// 1. CONSTANTS AND STATE
// =====================================================================

const STORAGE_KEY = "yrarbil-v4";
const SESSION_KEY = "yrarbil-session";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LOAN_DAYS = 14;
const MAX_LOANS = 3;

let database = loadDatabase();
let currentUser = restoreSession();
let currentTab = "scan";
let searchText = "";
let cameraScanner = null;        // the live camera scanner, if running
let newlyRegisteredUser = null;  // set right after sign-up to show the new card


// =====================================================================
// 2. DATA: demo data, saving and loading
// =====================================================================

function createDemoData() {
  const now = Date.now();
  return {
    // Each member card QR holds a "token". Each book label QR holds a "code".
    users: [
      { id: 1, name: "Angelo Castor",  token: "ANGELOCASTOR-7F3A", role: "member" },
      { id: 2, name: "Junalyn Nebria",  token: "JUNALYNNEBRIA-B20C", role: "member" },
      { id: 3, name: "Joshua Magalo", token: "JOSHUAMAGALO-AD11", role: "admin" },
    ],
    books: [
      { id: 1, code: "LEFTHA-0001", title: "The Left Hand of Darkness", author: "Ursula K. Le Guin", genre: "Sci-fi" },
      { id: 2, code: "PRIDEA-0002", title: "Pride and Prejudice",       author: "Jane Austen",       genre: "Classic" },
      { id: 3, code: "SAPIEN-0003", title: "Sapiens",                   author: "Yuval Noah Harari", genre: "History" },
      { id: 4, code: "EDUCAT-0004", title: "Educated",                  author: "Tara Westover",     genre: "Memoir" },
      { id: 5, code: "HOBBIT-0005", title: "The Hobbit",                author: "J.R.R. Tolkien",    genre: "Fantasy" },
      { id: 6, code: "CLEANC-0006", title: "Clean Code",                author: "Robert C. Martin",  genre: "Tech" },
      { id: 7, code: "KITCHE-0007", title: "Kitchen",                   author: "Banana Yoshimoto",  genre: "Fiction" },
      { id: 8, code: "BRIEFH-0008", title: "A Brief History of Time",   author: "Stephen Hawking",   genre: "Science" },
    ],
    // Each loan: { id, userId, bookId, borrowedAt, dueAt, returnedAt, renewals }
    loans: [
      // One overdue loan so the overdue state is visible in the demo.
      { id: 1, userId: 2, bookId: 2, borrowedAt: now - 20 * MS_PER_DAY, dueAt: now - 6 * MS_PER_DAY, returnedAt: null, renewals: 0 },
    ],
    // Activity log: { at, userId, text }
    log: [],
  };
}

function loadDatabase() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch (error) { /* fall back to demo data */ }
  return createDemoData();
}

function saveDatabase() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(database)); } catch (error) { /* ignore */ }
}

function restoreSession() {
  try {
    const id = Number(sessionStorage.getItem(SESSION_KEY));
    return database.users.find((user) => user.id === id) || null;
  } catch (error) { return null; }
}

function saveSession() {
  try {
    if (currentUser) sessionStorage.setItem(SESSION_KEY, String(currentUser.id));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (error) { /* ignore */ }
}


// =====================================================================
// 3. HELPERS
// =====================================================================

const $ = (selector) => document.querySelector(selector);

const findUser = (id) => database.users.find((user) => user.id === id);
const findBook = (id) => database.books.find((book) => book.id === id);
const findUserByToken = (token) => database.users.find((user) => user.token === token);
const findBookByCode = (code) => database.books.find((book) => book.code === code);
const findActiveLoan = (bookId) => database.loans.find((loan) => loan.bookId === bookId && !loan.returnedAt);
const activeLoansOf = (userId) => database.loans.filter((loan) => loan.userId === userId && !loan.returnedAt);
const isOverdue = (loan) => !loan.returnedAt && loan.dueAt < Date.now();

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Stops user-typed text from being treated as HTML.
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(showToast.timerId);
  showToast.timerId = setTimeout(() => { toast.style.display = "none"; }, 2800);
}

function addLog(text) {
  database.log.push({ at: Date.now(), userId: currentUser ? currentUser.id : null, text: text });
  database.log = database.log.slice(-200);
}

// Keeps only the letters A-Z of a name (accents removed, upper-cased).
function lettersOf(text) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
}

// Member QR token: the letters of the member's name plus 4 random characters,
// e.g. "Angelo Castor" -> "ANGELOCASTOR-7F3A". The random part keeps it hard to guess.
function generateToken(name) {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return (lettersOf(name) || "MEMBER") + "-" + suffix;
}

// Book QR code: the first letters of the title plus its number,
// e.g. "The Hobbit" #5 -> "HOBBIT-0005".
function makeBookCode(title, id) {
  const letters = lettersOf(title.replace(/^(the|a|an)\s+/i, "")).slice(0, 6) || "BOOK";
  return letters + "-" + String(id).padStart(4, "0");
}


// =====================================================================
// 4. CORE LOGIC: what happens when a QR code is scanned
// =====================================================================

function handleScan(scannedText) {
  const code = (scannedText || "").trim().toUpperCase();
  const scannedUser = findUserByToken(code);
  const scannedBook = findBookByCode(code);

  // Nobody logged in: only a member card is accepted.
  if (!currentUser) {
    if (scannedUser) login(scannedUser);
    else showToast("Not a member card. Scan your YRARBIL card to log in.");
    return;
  }

  // Logged in: scanning your own card again logs you out.
  if (scannedUser) {
    if (scannedUser.id === currentUser.id) logout();
    else showToast("Log out first to switch members.");
    return;
  }

  if (!scannedBook) { showToast("Unknown QR code."); return; }

  // A book label: borrow it if free, return it if you (or a librarian) hold it.
  const loan = findActiveLoan(scannedBook.id);
  if (!loan) borrowBook(scannedBook.id);
  else if (loan.userId === currentUser.id || currentUser.role === "admin") returnBook(scannedBook.id);
  else showToast("“" + scannedBook.title + "” is borrowed by " + findUser(loan.userId).name + ".");
}

function login(user) {
  currentUser = user;
  currentTab = "scan";
  newlyRegisteredUser = null;
  addLog("Logged in");
  saveDatabase(); saveSession();
  showToast("Welcome, " + user.name.split(" ")[0] + "!");
  render();
}

function logout() {
  addLog("Logged out");
  saveDatabase();
  currentUser = null;
  saveSession();
  showToast("You’re logged out.");
  render();
}

// Sign-up: creates a member with a unique QR token, then shows the new card.
function registerUser(name) {
  if (!name.trim()) { showToast("Please enter your name."); return; }

  let token = generateToken(name);
  while (findUserByToken(token)) token = generateToken(name);

  const nextId = Math.max(0, ...database.users.map((user) => user.id)) + 1;
  newlyRegisteredUser = { id: nextId, name: name.trim(), token: token, role: "member" };
  database.users.push(newlyRegisteredUser);
  saveDatabase();
  showToast("Account created for " + newlyRegisteredUser.name + ".");
  render();
}

function borrowBook(bookId) {
  const book = findBook(bookId);
  const myLoans = activeLoansOf(currentUser.id);

  if (findActiveLoan(bookId)) { showToast("That book is already borrowed."); return; }
  if (myLoans.some(isOverdue)) { showToast("Return your overdue books first."); return; }
  if (myLoans.length >= MAX_LOANS) { showToast("Limit reached: " + MAX_LOANS + " books at a time."); return; }

  const now = Date.now();
  database.loans.push({
    id: now, userId: currentUser.id, bookId: bookId,
    borrowedAt: now, dueAt: now + LOAN_DAYS * MS_PER_DAY, returnedAt: null, renewals: 0,
  });
  addLog("Borrowed “" + book.title + "”");
  saveDatabase();
  showToast("Borrowed “" + book.title + "”. Due " + formatDate(now + LOAN_DAYS * MS_PER_DAY) + ".");
  render();
}

function returnBook(bookId) {
  const loan = findActiveLoan(bookId);
  if (!loan) return;
  loan.returnedAt = Date.now();
  addLog("Returned “" + findBook(bookId).title + "”");
  saveDatabase();
  showToast("Returned “" + findBook(bookId).title + "”. Thank you!");
  render();
}

// A loan can be renewed once, and only if it isn't overdue.
function renewBook(bookId) {
  const loan = findActiveLoan(bookId);
  if (!loan) return;
  if (isOverdue(loan)) { showToast("Overdue books can’t be renewed."); return; }
  if (loan.renewals >= 1) { showToast("Already renewed once."); return; }

  loan.dueAt += LOAN_DAYS * MS_PER_DAY;
  loan.renewals += 1;
  addLog("Renewed “" + findBook(bookId).title + "”");
  saveDatabase();
  showToast("Renewed. New due date: " + formatDate(loan.dueAt) + ".");
  render();
}

function addBook(title, author, genre) {
  if (!title.trim() || !author.trim()) { showToast("Title and author are required."); return; }
  const nextId = Math.max(0, ...database.books.map((book) => book.id)) + 1;
  database.books.push({
    id: nextId,
    code: makeBookCode(title.trim(), nextId),
    title: title.trim(), author: author.trim(), genre: genre.trim() || "General",
  });
  addLog("Added book “" + title.trim() + "”");
  saveDatabase();
  showToast("Book added. Its QR label is on the Scan tab.");
  render();
}

function resetDemoData() {
  database = createDemoData();
  saveDatabase();
  currentUser = null;
  newlyRegisteredUser = null;
  saveSession();
  render();
}


// =====================================================================
// 5. CAMERA SCANNING
// =====================================================================

function setCameraStatus(message) {
  const status = $("#camera-status");
  if (status) status.textContent = message;
}

function updateCameraButton() {
  const button = $("#camera-button");
  if (button) button.textContent = cameraScanner ? "Stop camera" : "Start camera";
}

// Turns a camera error into a message a person can act on.
function describeCameraError(error) {
  const name = (error && error.name) || "";
  const text = String(error);

  if (name === "NotAllowedError" || /permission|denied|not allowed/i.test(text)) {
    return "Camera access was blocked. Allow the camera for this site, or if the page is embedded, open it in its own tab. You can also use “Scan from photo”.";
  }
  if (name === "NotFoundError" || /no camera|not found/i.test(text)) {
    return "No camera was found on this device. Use “Scan from photo” or type a code.";
  }
  if (name === "NotReadableError") {
    return "The camera is in use by another app. Close it and try again.";
  }
  return "Couldn’t start the camera (" + (name || text) + "). Use “Scan from photo” or type a code.";
}

// Starts the live camera. Tapping the button again stops it.
async function startCamera() {
  if (cameraScanner) {
    await stopCamera();
    setCameraStatus("");
    return;
  }
  if (!$("#camera-view")) return;

  if (typeof Html5Qrcode === "undefined") {
    setCameraStatus("The scanner library didn’t load. Check your connection, or use “Scan from photo”.");
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setCameraStatus("This browser can’t use the camera here (it needs HTTPS). Use “Scan from photo”.");
    return;
  }

  setCameraStatus("Starting camera…");
  const scanner = new Html5Qrcode("camera-view");
  const config = { fps: 10, qrbox: { width: 220, height: 220 } };
  const onDecoded = (decodedText) => { stopCamera(); handleScan(decodedText); };
  const onNoCode = () => { /* ignore frames with no QR code */ };

  // Try the back camera first, then the front one (laptops only have a front camera).
  const cameraChoices = [{ facingMode: "environment" }, { facingMode: "user" }];
  let lastError = null;

  for (const choice of cameraChoices) {
    try {
      await scanner.start(choice, config, onDecoded, onNoCode);
      cameraScanner = scanner;
      setCameraStatus("Point the camera at a QR code.");
      updateCameraButton();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  setCameraStatus(describeCameraError(lastError));
}

async function stopCamera() {
  if (!cameraScanner) return;
  const scanner = cameraScanner;
  cameraScanner = null;
  try {
    await scanner.stop();
    scanner.clear();
  } catch (error) { /* already stopped */ }
  updateCameraButton();
}

// Fallback that works even when live camera access is blocked:
// take or choose a photo of a QR code and read it.
async function scanPhoto(file) {
  if (!file) return;
  if (typeof Html5Qrcode === "undefined") {
    setCameraStatus("The scanner library didn’t load. Type a code instead.");
    return;
  }

  await stopCamera();
  setCameraStatus("Reading photo…");
  try {
    const scanner = new Html5Qrcode("camera-view");
    const decodedText = await scanner.scanFile(file, false);
    setCameraStatus("");
    handleScan(decodedText);
  } catch (error) {
    setCameraStatus("No QR code found in that photo. Try again with the code filling more of the frame.");
  }
}


// =====================================================================
// 6. VIEWS: functions that return HTML
// =====================================================================

// A QR code card. "Simulate scan" lets you try the app without a camera.
function qrCardHtml(title, code, subtitleHtml, showSimulate) {
  return `
    <div class="qr-card">
      <div class="qr-image" data-qr="${code}"></div>
      <div class="qr-title">${escapeHtml(title)}</div>
      <div class="muted">${subtitleHtml}</div>
      ${showSimulate ? `<button data-action="simulate" data-scan="${code}" style="margin-top:6px">Simulate scan</button>` : ""}
    </div>`;
}

// Camera viewfinder, photo fallback and manual code entry.
function scannerHtml(placeholder) {
  return `
    <div id="camera-view"></div>
    <p id="camera-status" class="muted"></p>
    <div class="row">
      <button class="primary" data-action="camera" id="camera-button">Start camera</button>
      <button data-action="photo">Scan from photo</button>
      <input id="photo-input" type="file" accept="image/*" hidden>
    </div>
    <form data-form="manual" class="row" style="margin-top:8px">
      <input name="code" placeholder="${placeholder}">
      <button type="submit">Go</button>
    </form>`;
}

// Sign-up form, or the freshly created member card right after signing up.
function signUpCardHtml() {
  if (newlyRegisteredUser) {
    return `
      <div class="card">
        <h2>Account created</h2>
        <p class="muted">This is your YRARBIL member card. Screenshot or print it: you scan it to log in.</p>
        <div class="qr-grid">${qrCardHtml(newlyRegisteredUser.name, newlyRegisteredUser.token, "member", false)}</div>
        <div class="row" style="margin-top:10px">
          <button class="primary" data-action="login-new">Log in now</button>
        </div>
      </div>`;
  }
  return `
    <div class="card">
      <h2>New member? Sign up</h2>
      <p class="muted">Enter your name to get your personal QR member card.</p>
      <form data-form="signup" class="row">
        <input name="name" placeholder="Your full name" autocomplete="name">
        <button class="primary" type="submit">Create card</button>
      </form>
    </div>`;
}

function authViewHtml() {
  const memberCards = database.users
    .map((user) => qrCardHtml(user.name, user.token, user.role === "admin" ? "librarian" : "member", true))
    .join("");

  return `
    <div class="card">
      <h2>Log in with your member card</h2>
      <p class="muted">Scan your card with the camera, or use the demo cards below.</p>
      ${scannerHtml("Type code, e.g. ANGELOCASTOR-7F3A")}
    </div>
    ${signUpCardHtml()}
    <div class="card">
      <h2>Demo member cards</h2>
      <p class="muted">Junalyn has an overdue book. Joshua is the librarian.</p>
      <div class="qr-grid">${memberCards}</div>
    </div>`;
}

function shortStatusHtml(book) {
  const loan = findActiveLoan(book.id);
  if (!loan) return `<span class="status-ok">Available</span>`;
  return `<span class="${isOverdue(loan) ? "status-danger" : "status-warning"}">Out</span>`;
}

function scanTabHtml() {
  const labels = database.books
    .map((book) => qrCardHtml(book.title, book.code, shortStatusHtml(book), true))
    .join("");

  return `
    <div class="card">
      <h2>Scan a book</h2>
      <p class="muted">A free book is borrowed on scan. Scan one you hold to return it. Scan your own member card to log out.</p>
      ${scannerHtml("Type code, e.g. HOBBIT-0005")}
    </div>
    <div class="card">
      <h2>Book labels (demo)</h2>
      <p class="muted">In a real library these QR labels are stuck inside each book.</p>
      <div class="qr-grid">${labels}</div>
    </div>`;
}

function bookRowHtml(book) {
  const loan = findActiveLoan(book.id);
  let statusHtml = `<span class="status-ok">Available</span>`;
  let buttonHtml = `<button class="primary" data-action="borrow" data-id="${book.id}">Borrow</button>`;

  if (loan) {
    const mine = loan.userId === currentUser.id;
    const cssClass = isOverdue(loan) ? "status-danger" : "status-warning";
    statusHtml = `<span class="${cssClass}">${mine ? "You have this" : "Out"} · due ${formatDate(loan.dueAt)}</span>`;
    buttonHtml = mine
      ? `<button data-action="return" data-id="${book.id}">Return</button>`
      : `<button disabled>Unavailable</button>`;
  }

  return `
    <div class="book">
      <div>
        <div><span class="book-title">${escapeHtml(book.title)}</span><span class="tag">${escapeHtml(book.genre)}</span></div>
        <div class="muted">${escapeHtml(book.author)} · ${statusHtml}</div>
      </div>
      ${buttonHtml}
    </div>`;
}

// Only this list is redrawn while typing in the search box, so the box keeps focus.
function bookListHtml() {
  const query = searchText.trim().toLowerCase();
  const matches = database.books.filter((book) =>
    (book.title + " " + book.author + " " + book.genre).toLowerCase().includes(query)
  );
  return matches.length
    ? matches.map(bookRowHtml).join("")
    : `<p class="muted">No books match “${escapeHtml(searchText)}”.</p>`;
}

function catalogTabHtml() {
  return `
    <div class="card">
      <input id="search" placeholder="Search title, author or genre" value="${escapeHtml(searchText)}" style="width:100%;margin-bottom:6px">
      <div id="book-list">${bookListHtml()}</div>
    </div>`;
}

function myLoansTabHtml() {
  const myLoans = activeLoansOf(currentUser.id);
  if (!myLoans.length) {
    return `<div class="card"><h2>My loans</h2><p class="muted">Nothing borrowed right now. Scan a book to borrow it.</p></div>`;
  }

  const rows = myLoans.map((loan) => `
    <tr>
      <td>${escapeHtml(findBook(loan.bookId).title)}</td>
      <td class="${isOverdue(loan) ? "status-danger" : ""}">${formatDate(loan.dueAt)}${isOverdue(loan) ? " (overdue)" : ""}</td>
      <td>
        <button data-action="renew" data-id="${loan.bookId}" ${loan.renewals >= 1 || isOverdue(loan) ? "disabled" : ""}>Renew</button>
        <button data-action="return" data-id="${loan.bookId}">Return</button>
      </td>
    </tr>`).join("");

  return `
    <div class="card">
      <h2>My loans (${myLoans.length}/${MAX_LOANS})</h2>
      <div class="table-scroll"><table><tr><th>Book</th><th>Due</th><th></th></tr>${rows}</table></div>
    </div>`;
}

function loanStatus(loan) {
  if (loan.returnedAt) return { label: "Returned", cssClass: "status-ok" };
  if (isOverdue(loan)) return { label: "Overdue", cssClass: "status-danger" };
  return { label: "Out", cssClass: "status-warning" };
}

function adminTabHtml() {
  const loanRows = database.loans.slice().reverse().map((loan) => {
    const status = loanStatus(loan);
    return `<tr>
      <td>${escapeHtml(findBook(loan.bookId).title)}</td>
      <td>${escapeHtml(findUser(loan.userId).name)}</td>
      <td>${formatDate(loan.dueAt)}</td>
      <td class="${status.cssClass}">${status.label}</td></tr>`;
  }).join("");

  const logRows = database.log.slice(-15).reverse().map((entry) => {
    const user = entry.userId ? findUser(entry.userId) : null;
    return `<tr><td>${formatDateTime(entry.at)}</td><td>${user ? escapeHtml(user.name) : "—"}</td><td>${escapeHtml(entry.text)}</td></tr>`;
  }).join("");

  const memberCards = database.users
    .map((user) => qrCardHtml(user.name, user.token, user.role === "admin" ? "librarian" : "member", false))
    .join("");

  return `
    <div class="card"><h2>All loans</h2>
      <div class="table-scroll"><table><tr><th>Book</th><th>Member</th><th>Due</th><th>Status</th></tr>${loanRows}</table></div>
    </div>
    <div class="card"><h2>Activity log</h2>
      ${logRows ? `<div class="table-scroll"><table><tr><th>When</th><th>Who</th><th>What</th></tr>${logRows}</table></div>` : `<p class="muted">No activity yet.</p>`}
    </div>
    <div class="card"><h2>Member cards</h2>
      <p class="muted">Print these for members. Treat them like keys: anyone with the QR can log in as that member.</p>
      <div class="qr-grid">${memberCards}</div>
    </div>
    <div class="card"><h2>Add a book</h2>
      <form data-form="add-book" class="row">
        <input name="title" placeholder="Title">
        <input name="author" placeholder="Author">
        <input name="genre" placeholder="Genre">
        <button class="primary" type="submit">Add</button>
      </form>
    </div>
    <div class="card"><h2>Reset</h2><button data-action="reset">Reset demo data</button></div>`;
}

function mainViewHtml() {
  const myCount = activeLoansOf(currentUser.id).length;
  const tabButton = (id, label) =>
    `<button data-action="tab" data-tab="${id}" class="${currentTab === id ? "active" : ""}">${label}</button>`;

  let html = `<div class="tabs">
    ${tabButton("scan", "Scan")}
    ${tabButton("catalog", "Catalog")}
    ${tabButton("mine", "My loans (" + myCount + ")")}
    ${currentUser.role === "admin" ? tabButton("admin", "Librarian") : ""}
  </div>`;

  if (currentTab === "scan") html += scanTabHtml();
  if (currentTab === "catalog") html += catalogTabHtml();
  if (currentTab === "mine") html += myLoansTabHtml();
  if (currentTab === "admin" && currentUser.role === "admin") html += adminTabHtml();
  return html;
}


// =====================================================================
// 7. RENDERING AND EVENTS
// =====================================================================

function drawQrCodes() {
  document.querySelectorAll("[data-qr]").forEach((element) => {
    element.innerHTML = "";
    try {
      new QRCode(element, { text: element.dataset.qr, width: 96, height: 96 });
    } catch (error) {
      element.textContent = element.dataset.qr; // fall back to plain text
    }
  });
}

function render() {
  stopCamera();
  $("#user-info").innerHTML = currentUser
    ? `<span class="muted">${escapeHtml(currentUser.name)}${currentUser.role === "admin" ? " · librarian" : ""}</span>
       <button data-action="logout">Log out</button>`
    : "";
  $("#app").innerHTML = currentUser ? mainViewHtml() : authViewHtml();
  drawQrCodes();
}

// One click handler for every button, using data-action attributes.
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = Number(button.dataset.id);

  switch (button.dataset.action) {
    case "tab":       currentTab = button.dataset.tab; render(); break;
    case "logout":    logout(); break;
    case "camera":    startCamera(); break;
    case "photo":     $("#photo-input").click(); break;
    case "simulate":  handleScan(button.dataset.scan); break;
    case "login-new": login(newlyRegisteredUser); break;
    case "borrow":    borrowBook(id); break;
    case "return":    returnBook(id); break;
    case "renew":     renewBook(id); break;
    case "reset":     resetDemoData(); break;
  }
});

// One submit handler for every form, using data-form attributes.
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));

  switch (form.dataset.form) {
    case "manual":   form.reset(); handleScan(data.code || ""); break;
    case "signup":   registerUser(data.name || ""); break;
    case "add-book": addBook(data.title || "", data.author || "", data.genre || ""); break;
  }
});

// A photo was chosen: read the QR code from it.
document.addEventListener("change", (event) => {
  if (event.target.id !== "photo-input") return;
  scanPhoto(event.target.files[0]);
  event.target.value = "";
});

// Live search: redraw only the list, not the search box.
document.addEventListener("input", (event) => {
  if (event.target.id !== "search") return;
  searchText = event.target.value;
  $("#book-list").innerHTML = bookListHtml();
});

render();
