const API = "";
let sessionToken = null;
let currentInput = "";
let inputMode = "none";
let inputCallback = null;
let linkedAccounts = [];

const mainArea = document.getElementById("mainArea");
const cardLabel = document.getElementById("cardLabel");
const statusText = document.getElementById("statusText");
const sessionInfo = document.getElementById("sessionInfo");
const cardLight = document.getElementById("cardLight");
const toast = document.getElementById("toast");
const timeDisplay = document.getElementById("timeDisplay");

// ─── Clock ────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    timeDisplay.textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// ─── API Helper ───────────────────────────────────────────────
async function api(method, path, body = null) {
    const headers = { "Content-Type": "application/json" };
    if (sessionToken) headers["X-Session-Token"] = sessionToken;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API}${path}`, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
}

// ─── Toast ────────────────────────────────────────────────────
function showToast(msg, isError = false) {
    toast.textContent = msg;
    toast.className = "toast show" + (isError ? " error" : "");
    setTimeout(() => { toast.className = "toast"; }, 3000);
}

// ─── Side Button Management ───────────────────────────────────
const leftBtns = document.querySelectorAll(".side-left .fn-btn");
const rightBtns = document.querySelectorAll(".side-right .fn-btn");

function clearSideButtons() {
    [...leftBtns, ...rightBtns].forEach((b) => {
        b.classList.remove("active", "hidden");
    });
}

function setSideLabel(btn, label) {
    const slot = btn.closest(".side-buttons").classList.contains("side-left") ? "left" : "right";
    const idx = Array.from(btn.closest(".side-buttons").children).indexOf(btn);

    const existing = btn.parentElement.querySelector(`.side-label-${slot}-${idx}`);
    if (existing) existing.remove();

    const labelEl = document.createElement("div");
    labelEl.className = `side-label side-label-${slot}-${idx}`;
    labelEl.textContent = label;
    labelEl.style.cssText = `
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        font-size: 11px;
        font-weight: 600;
        color: var(--gray);
        white-space: nowrap;
        pointer-events: none;
        transition: color 0.15s;
        ${slot === "left" ? "right: calc(100% + 8px);" : "left: calc(100% + 8px);"}
    `;
    btn.style.position = "relative";
    btn.appendChild(labelEl);
}

function setupSideButtons(leftLabels = [], rightLabels = []) {
    clearSideButtons();
    removeSideLabels();

    leftBtns.forEach((btn, i) => {
        if (i < leftLabels.length && leftLabels[i]) {
            btn.classList.remove("hidden");
            setSideLabel(btn, leftLabels[i]);
        } else {
            btn.classList.add("hidden");
        }
    });

    rightBtns.forEach((btn, i) => {
        if (i < rightLabels.length && rightLabels[i]) {
            btn.classList.remove("hidden");
            setSideLabel(btn, rightLabels[i]);
        } else {
            btn.classList.add("hidden");
        }
    });
}

function removeSideLabels() {
    document.querySelectorAll("[class^='side-label']").forEach((el) => el.remove());
}

// ─── Keypad Input ─────────────────────────────────────────────
function startInput(mode, callback) {
    inputMode = mode;
    currentInput = "";
    inputCallback = callback;
    updateInputDisplay();
}

function handleKey(key) {
    if (inputMode === "none") return;
    if (key === "clear") { currentInput = ""; updateInputDisplay(); return; }
    if (key === "enter") {
        if (inputCallback && currentInput.length > 0) {
            const val = currentInput;
            currentInput = "";
            updateInputDisplay();
            inputCallback(val);
        }
        return;
    }
    if (inputMode === "pin" && currentInput.length >= 4) return;
    if (inputMode === "amount" && currentInput.length >= 10) return;
    if (inputMode === "text" && currentInput.length >= 20) return;
    currentInput += key;
    updateInputDisplay();
}

function updateInputDisplay() {
    const el = document.getElementById("inputValue");
    if (!el) return;
    if (inputMode === "pin") {
        el.innerHTML = "●".repeat(currentInput.length) + '<span class="cursor"></span>';
    } else {
        const formatted = currentInput ? Number(currentInput).toLocaleString("en-IN") : "0";
        el.innerHTML = `Rs. ${formatted}<span class="cursor"></span>`;
    }
}

document.querySelectorAll(".nkey").forEach((btn) => {
    btn.addEventListener("click", () => handleKey(btn.dataset.key));
});

document.addEventListener("keydown", (e) => {
    if (e.key >= "0" && e.key <= "9") handleKey(e.key);
    else if (e.key === "Enter") handleKey("enter");
    else if (e.key === "Backspace" || e.key === "Escape") handleKey("clear");
});

// ─── Helper: render HTML ──────────────────────────────────────
function render(html) {
    mainArea.innerHTML = html;
}

function setStatus(text) { statusText.textContent = text; }
function setSession(text) { sessionInfo.textContent = text; }

// ═══════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════

// ─── Welcome Screen ───────────────────────────────────────────
function showWelcome() {
    inputMode = "none";
    cardLabel.textContent = "INSERT CARD";
    cardLight.className = "card-light";
    setSession("");
    removeSideLabels();

    setupSideButtons([], []);

    render(`
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="1.5" width="64" height="64" style="opacity:0.4">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
                <circle cx="17" cy="14" r="1.5" fill="var(--emerald)"/>
            </svg>
            <div class="atm-title" style="text-align:center;">NATIONAL BANK</div>
            <div class="atm-subtitle" style="text-align:center;">Please insert your card to begin</div>
            <hr class="divider" style="width:60%;">
            <div class="input-display" style="width:320px;">
                <span id="inputValue" style="font-size:16px; letter-spacing:3px; color:var(--gray);">Card Number</span>
            </div>
            <div style="font-size:11px; color:var(--gray-dim); text-align:center; line-height:1.8;">
                Demo Cards:<br>
                <span style="color:var(--emerald-dim); font-family:var(--mono);">4000000000000001</span> &nbsp; PIN: <span style="color:var(--gold);">1234</span><br>
                <span style="color:var(--emerald-dim); font-family:var(--mono);">4000000000000002</span> &nbsp; PIN: <span style="color:var(--gold);">5678</span><br>
                <span style="color:var(--emerald-dim); font-family:var(--mono);">4000000000000003</span> &nbsp; PIN: <span style="color:var(--gold);">9999</span>
            </div>
        </div>
    `);

    setTimeout(() => startInput("text", (val) => insertCard(val)), 100);
}

async function insertCard(cardNumber) {
    render(`<div class="spinner-wrap"><div class="spinner"></div><div class="spinner-text">Reading card...</div></div>`);
    try {
        const data = await api("POST", "/api/card/insert", { cardNumber: cardNumber.trim() });
        sessionToken = data.sessionToken;
        linkedAccounts = data.linkedAccounts;
        cardLabel.textContent = data.maskedCard;
        cardLight.className = "card-light active";
        showToast("Card inserted");
        showPinEntry();
    } catch (err) {
        showToast(err.message, true);
        if (err.message.includes("BLOCKED")) cardLight.className = "card-light blocked";
        showWelcome();
    }
}

// ─── PIN Entry ────────────────────────────────────────────────
function showPinEntry() {
    inputMode = "none";
    setStatus("ENTER PIN");
    removeSideLabels();

    setupSideButtons(
        ["", "", "", "", "", ""],
        ["", "", "", "", "CANCEL", ""]
    );

    const cancelBtn = rightBtns[4];
    cancelBtn.onclick = () => cancelTransaction();

    render(`
        <div class="pin-area">
            <div class="atm-subtitle" style="margin-bottom:24px;">Enter your 4-digit PIN</div>
            <div class="pin-dots">
                <div class="pin-dot" id="pd0"></div>
                <div class="pin-dot" id="pd1"></div>
                <div class="pin-dot" id="pd2"></div>
                <div class="pin-dot" id="pd3"></div>
            </div>
            <div class="input-display" style="width:240px; margin-top:16px;">
                <span id="inputValue"></span>
            </div>
            <div class="msg-error" id="pinError"></div>
        </div>
    `);

    setTimeout(() => {
        startInput("pin", (pin) => validatePin(pin));
        const origUpdate = updateInputDisplay;
        window._pinUpdate = origUpdate;
    }, 100);

    // Override updateInputDisplay to also update dots
    const origFn = updateInputDisplay;
    window._origUpdateDisplay = origFn;
    window.updateInputDisplay = function() {
        const el = document.getElementById("inputValue");
        if (!el) return;
        el.innerHTML = "●".repeat(currentInput.length) + '<span class="cursor"></span>';
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`pd${i}`);
            if (dot) {
                dot.classList.toggle("filled", i < currentInput.length);
                dot.classList.remove("error");
            }
        }
    };
}

async function validatePin(pin) {
    document.getElementById("pinError").innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div>';
    try {
        const data = await api("POST", "/api/card/pin", { pin });
        if (data.success) {
            showToast("PIN verified");
            // Flash green dots
            for (let i = 0; i < 4; i++) {
                const dot = document.getElementById(`pd${i}`);
                if (dot) { dot.classList.add("filled"); dot.classList.remove("error"); }
            }
            setTimeout(() => {
                restoreUpdateDisplay();
                if (linkedAccounts.length === 1) {
                    selectAccount(linkedAccounts[0].accountNumber);
                } else {
                    showAccountSelect();
                }
            }, 600);
        } else if (data.blocked) {
            cardLight.className = "card-light blocked";
            for (let i = 0; i < 4; i++) {
                const dot = document.getElementById(`pd${i}`);
                if (dot) { dot.classList.add("error"); dot.classList.remove("filled"); }
            }
            document.getElementById("pinError").textContent = "Card BLOCKED";
            showToast("Card blocked", true);
            setTimeout(() => ejectCard(), 2000);
        } else {
            document.getElementById("pinError").textContent = data.message;
            // Flash red
            for (let i = 0; i < 4; i++) {
                const dot = document.getElementById(`pd${i}`);
                if (dot) { dot.classList.add("error"); dot.classList.remove("filled"); }
            }
            setTimeout(() => {
                for (let i = 0; i < 4; i++) {
                    const dot = document.getElementById(`pd${i}`);
                    if (dot) dot.classList.remove("error");
                }
            }, 800);
            currentInput = "";
            updateInputDisplay();
        }
    } catch (err) {
        document.getElementById("pinError").textContent = err.message;
        currentInput = "";
        updateInputDisplay();
    }
}

function restoreUpdateDisplay() {
    window.updateInputDisplay = function() {
        const el = document.getElementById("inputValue");
        if (!el) return;
        const formatted = currentInput ? Number(currentInput).toLocaleString("en-IN") : "0";
        el.innerHTML = `Rs. ${formatted}<span class="cursor"></span>`;
    };
}

// ─── Account Select ───────────────────────────────────────────
function showAccountSelect() {
    inputMode = "none";
    setStatus("SELECT ACCOUNT");
    removeSideLabels();

    setupSideButtons(
        ["", "", "", "", "", ""],
        ["", "", "", "", "CANCEL", ""]
    );

    rightBtns[4].onclick = () => cancelTransaction();

    let cardsHtml = linkedAccounts.map((a, i) => `
        <div class="acc-card" data-idx="${i}">
            <div class="acc-left">
                <div class="acc-num">${a.accountNumber}</div>
                <div class="acc-type">${a.accountType}</div>
            </div>
            <div class="acc-bal">Rs. ${Number(a.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</div>
        </div>
    `).join("");

    render(`
        <div class="atm-title">SELECT ACCOUNT</div>
        <div class="atm-subtitle">Choose account to use</div>
        <hr class="divider">
        <div class="acc-cards">${cardsHtml}</div>
    `);

    document.querySelectorAll(".acc-card").forEach((card) => {
        card.addEventListener("click", () => {
            const idx = parseInt(card.dataset.idx);
            selectAccount(linkedAccounts[idx].accountNumber);
        });
    });
}

async function selectAccount(accountNumber) {
    try {
        await api("POST", "/api/account/select", { accountNumber });
        setSession(`Acct: ${accountNumber}`);
        showToast(`Account ${accountNumber}`);
        showMenu();
    } catch (err) {
        showToast(err.message, true);
    }
}

// ─── Main Menu ────────────────────────────────────────────────
function showMenu() {
    inputMode = "none";
    setStatus("MAIN MENU");
    removeSideLabels();

    setupSideButtons(
        ["CHECK BALANCE", "WITHDRAW", "CHANGE PIN"],
        ["DEPOSIT", "TRANSFER", "STATEMENT"]
    );

    leftBtns[0].onclick = () => showCheckBalance();
    leftBtns[1].onclick = () => showWithdraw();
    leftBtns[2].onclick = () => showChangePin();
    rightBtns[0].onclick = () => showDeposit();
    rightBtns[1].onclick = () => showTransfer();
    rightBtns[2].onclick = () => showMiniStatement();

    render(`
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--emerald)" stroke-width="1.5" width="48" height="48" style="opacity:0.3;">
                <rect x="2" y="5" width="20" height="14" rx="2"/>
                <line x1="2" y1="10" x2="22" y2="10"/>
            </svg>
            <div class="atm-subtitle" style="text-align:center;">Select an option using the buttons on the sides of the screen</div>
        </div>
    `);
}

// ─── Check Balance ────────────────────────────────────────────
async function showCheckBalance() {
    inputMode = "none";
    setStatus("BALANCE");
    removeSideLabels();

    setupSideButtons(["", "", "", "", "BACK", ""], ["", "", "", "", "EXIT", ""]);
    leftBtns[4].onclick = () => showMenu();
    rightBtns[4].onclick = () => cancelTransaction();

    render(`<div class="spinner-wrap"><div class="spinner"></div><div class="spinner-text">Loading balance...</div></div>`);

    try {
        const data = await api("GET", "/api/account/balance");
        const bal = Number(data.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 });
        const avail = Number(data.availableForWithdrawal).toLocaleString("en-IN", { minimumFractionDigits: 2 });

        render(`
            <div class="atm-section-title">ACCOUNT OVERVIEW</div>
            <div class="balance-hero">
                <div class="balance-label">Available Balance</div>
                <div class="balance-amount"><span class="balance-currency">Rs. </span>${Number(data.balance).toLocaleString("en-IN")}</div>
            </div>
            <hr class="divider">
            <div class="info-grid">
                <div class="info-row"><span class="info-label">Account</span><span class="info-value">${data.accountNumber}</span></div>
                <div class="info-row"><span class="info-label">Type</span><span class="info-value gold">${data.accountType}</span></div>
                <div class="info-row"><span class="info-label">Holder</span><span class="info-value">${data.holderName}</span></div>
                <div class="info-row"><span class="info-label">Available for Withdrawal</span><span class="info-value green">Rs. ${avail}</span></div>
                <div class="info-row"><span class="info-label">Daily Withdrawn</span><span class="info-value gold">Rs. ${Number(data.limits.dailyWithdrawn).toLocaleString("en-IN")}</span></div>
                <div class="info-row"><span class="info-label">Daily Remaining</span><span class="info-value">Rs. ${Number(data.limits.dailyRemaining).toLocaleString("en-IN")}</span></div>
                ${data.accountType === "CURRENT" ? `
                <div class="info-row"><span class="info-label">Overdraft Limit</span><span class="info-value">Rs. ${Number(data.limits.overdraftLimit).toLocaleString("en-IN")}</span></div>
                ` : `
                <div class="info-row"><span class="info-label">Min Balance</span><span class="info-value">Rs. ${Number(data.limits.minBalance).toLocaleString("en-IN")}</span></div>
                `}
            </div>
        `);
    } catch (err) {
        showToast(err.message, true);
        showMenu();
    }
}

// ─── Deposit ──────────────────────────────────────────────────
function showDeposit() {
    inputMode = "none";
    setStatus("DEPOSIT");
    removeSideLabels();

    setupSideButtons(
        ["", "", "", "", "BACK", ""],
        ["", "", "", "", "CANCEL", "CONFIRM"]
    );
    leftBtns[4].onclick = () => showMenu();
    rightBtns[4].onclick = () => cancelTransaction();
    rightBtns[5].onclick = () => submitDeposit();

    render(`
        <div class="atm-section-title">DEPOSIT FUNDS</div>
        <div class="atm-subtitle">Enter amount or select preset</div>
        <div class="amount-presets">
            <div class="preset" onclick="setAmount(5000)">5,000</div>
            <div class="preset" onclick="setAmount(10000)">10,000</div>
            <div class="preset" onclick="setAmount(20000)">20,000</div>
            <div class="preset" onclick="setAmount(50000)">50,000</div>
            <div class="preset" onclick="setAmount(100000)">1,00,000</div>
            <div class="preset" onclick="setAmount(200000)">2,00,000</div>
        </div>
        <div class="input-display"><span id="inputValue">Rs. 0<span class="cursor"></span></span></div>
        <div class="msg-error" id="depositMsg"></div>
    `);

    setTimeout(() => startInput("amount", () => submitDeposit()), 100);
}

function setAmount(amt) {
    currentInput = String(amt);
    updateInputDisplay();
}

async function submitDeposit() {
    const amount = Number(currentInput);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", true); return; }

    render(`<div class="spinner-wrap"><div class="spinner"></div><div class="spinner-text">Processing deposit...</div></div>`);

    try {
        const data = await api("POST", "/api/account/deposit", { amount });

        setupSideButtons(["", "", "", "", "MENU", ""], ["", "", "", "", "", "EXIT"]);
        leftBtns[4].onclick = () => showMenu();
        rightBtns[5].onclick = () => cancelTransaction();

        render(`
            <div class="atm-section-title" style="color:var(--emerald);">DEPOSIT SUCCESSFUL</div>
            <div class="info-grid" style="margin-top:16px;">
                <div class="info-row"><span class="info-label">Transaction ID</span><span class="info-value gold">${data.transactionId}</span></div>
                <div class="info-row"><span class="info-label">Amount Deposited</span><span class="info-value green">+ Rs. ${Number(data.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                <div class="info-row"><span class="info-label">New Balance</span><span class="info-value green">Rs. ${Number(data.newBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
        `);
        showToast("Deposit successful!");
    } catch (err) {
        showToast(err.message, true);
        showDeposit();
    }
}

// ─── Withdraw ─────────────────────────────────────────────────
async function showWithdraw() {
    inputMode = "none";
    setStatus("WITHDRAW");
    removeSideLabels();

    setupSideButtons(
        ["", "", "", "", "BACK", ""],
        ["", "", "", "", "CANCEL", "CONFIRM"]
    );
    leftBtns[4].onclick = () => showMenu();
    rightBtns[4].onclick = () => cancelTransaction();
    rightBtns[5].onclick = () => submitWithdraw();

    let infoHtml = "";
    try {
        const data = await api("GET", "/api/account/balance");
        infoHtml = `<div style="font-size:11px; color:var(--gray); text-align:center; margin-bottom:12px;">Available: Rs. ${Number(data.availableForWithdrawal).toLocaleString("en-IN", { minimumFractionDigits: 2 })} &nbsp;|&nbsp; Fee: Rs. ${data.fees.withdrawalFee}</div>`;
    } catch (e) {}

    render(`
        <div class="atm-section-title">WITHDRAW CASH</div>
        ${infoHtml}
        <div class="amount-presets">
            <div class="preset" onclick="setAmount(500)">500</div>
            <div class="preset" onclick="setAmount(1000)">1,000</div>
            <div class="preset" onclick="setAmount(2000)">2,000</div>
            <div class="preset" onclick="setAmount(5000)">5,000</div>
            <div class="preset" onclick="setAmount(10000)">10,000</div>
            <div class="preset" onclick="setAmount(20000)">20,000</div>
        </div>
        <div class="input-display"><span id="inputValue">Rs. 0<span class="cursor"></span></span></div>
        <div class="msg-error" id="withdrawMsg"></div>
    `);

    setTimeout(() => startInput("amount", () => submitWithdraw()), 100);
}

async function submitWithdraw() {
    const amount = Number(currentInput);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", true); return; }

    render(`<div class="spinner-wrap"><div class="spinner"></div><div class="spinner-text">Processing withdrawal...</div></div>`);

    try {
        const data = await api("POST", "/api/account/withdraw", { amount });

        let notesHtml = "";
        for (const [note, count] of Object.entries(data.dispensed)) {
            if (count > 0) {
                notesHtml += `<div class="dispensed-note"><span>${note} × ${count}</span><span class="note-val">Rs. ${(note * count).toLocaleString("en-IN")}</span></div>`;
            }
        }

        setupSideButtons(["", "", "", "", "MENU", ""], ["", "", "", "", "", "EXIT"]);
        leftBtns[4].onclick = () => showMenu();
        rightBtns[5].onclick = () => cancelTransaction();

        render(`
            <div class="atm-section-title" style="color:var(--emerald);">WITHDRAWAL SUCCESSFUL</div>
            <div class="info-grid" style="margin-top:12px;">
                <div class="info-row"><span class="info-label">Transaction ID</span><span class="info-value gold">${data.transactionId}</span></div>
                <div class="info-row"><span class="info-label">Amount</span><span class="info-value red">- Rs. ${Number(data.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                <div class="info-row"><span class="info-label">Fee</span><span class="info-value gold">Rs. ${Number(data.fee).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                <div class="info-row"><span class="info-label">Total Debited</span><span class="info-value red">Rs. ${Number(data.totalDebited).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
            <div class="dispensed-box">
                <div class="dispensed-title">CASH DISPENSED</div>
                ${notesHtml}
            </div>
            <div class="info-row" style="margin-top:8px;"><span class="info-label">New Balance</span><span class="info-value green">Rs. ${Number(data.newBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
        `);
        showToast("Please collect your cash!");
    } catch (err) {
        showToast(err.message, true);
        showWithdraw();
    }
}

// ─── Transfer ─────────────────────────────────────────────────
function showTransfer() {
    inputMode = "none";
    setStatus("TRANSFER");
    removeSideLabels();

    setupSideButtons(
        ["", "", "", "", "BACK", ""],
        ["", "", "", "", "CANCEL", ""]
    );
    leftBtns[4].onclick = () => showMenu();
    rightBtns[4].onclick = () => cancelTransaction();

    render(`
        <div class="atm-section-title">MONEY TRANSFER</div>
        <div class="atm-subtitle">Enter receiver account number</div>
        <div class="input-display" style="font-size:18px; letter-spacing:3px;">
            <span id="inputValue" style="font-size:18px;"></span>
        </div>
        <div class="msg-error" id="transferMsg"></div>
    `);

    setTimeout(() => startInput("text", (val) => showTransferAmount(val.trim())), 100);
}

function showTransferAmount(receiverAccount) {
    inputMode = "none";
    setStatus("TRANSFER");

    setupSideButtons(
        ["", "", "", "", "BACK", ""],
        ["", "", "", "", "CANCEL", "CONFIRM"]
    );
    leftBtns[4].onclick = () => showTransfer();
    rightBtns[4].onclick = () => cancelTransaction();
    rightBtns[5].onclick = () => submitTransfer(receiverAccount);

    let infoHtml = "";
    (async () => {
        try {
            const data = await api("GET", "/api/account/balance");
            const el = document.getElementById("transferInfo");
            if (el) el.textContent = `Available: Rs. ${Number(data.availableForWithdrawal).toLocaleString("en-IN", { minimumFractionDigits: 2 })} | Fee: Rs. ${data.fees.transferFee}`;
        } catch (e) {}
    })();

    render(`
        <div class="atm-section-title">TRANSFER TO ${receiverAccount}</div>
        <div id="transferInfo" style="font-size:11px; color:var(--gray); text-align:center; margin-bottom:12px;"></div>
        <div class="amount-presets">
            <div class="preset" onclick="setAmount(1000)">1,000</div>
            <div class="preset" onclick="setAmount(5000)">5,000</div>
            <div class="preset" onclick="setAmount(10000)">10,000</div>
            <div class="preset" onclick="setAmount(20000)">20,000</div>
            <div class="preset" onclick="setAmount(50000)">50,000</div>
            <div class="preset" onclick="setAmount(100000)">1,00,000</div>
        </div>
        <div class="input-display"><span id="inputValue">Rs. 0<span class="cursor"></span></span></div>
    `);

    setTimeout(() => startInput("amount", () => submitTransfer(receiverAccount)), 100);
}

async function submitTransfer(receiverAccount) {
    const amount = Number(currentInput);
    if (!amount || amount <= 0) { showToast("Enter a valid amount", true); return; }

    render(`<div class="spinner-wrap"><div class="spinner"></div><div class="spinner-text">Processing transfer...</div></div>`);

    try {
        const data = await api("POST", "/api/account/transfer", {
            receiverAccountNumber: receiverAccount,
            amount,
        });

        setupSideButtons(["", "", "", "", "MENU", ""], ["", "", "", "", "", "EXIT"]);
        leftBtns[4].onclick = () => showMenu();
        rightBtns[5].onclick = () => cancelTransaction();

        render(`
            <div class="atm-section-title" style="color:var(--emerald);">TRANSFER SUCCESSFUL</div>
            <div class="info-grid" style="margin-top:16px;">
                <div class="info-row"><span class="info-label">Transaction ID</span><span class="info-value gold">${data.transactionId}</span></div>
                <div class="info-row"><span class="info-label">Receiver</span><span class="info-value">${data.receiverName} (${data.receiverAccount})</span></div>
                <div class="info-row"><span class="info-label">Amount</span><span class="info-value red">- Rs. ${Number(data.amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                <div class="info-row"><span class="info-label">Fee</span><span class="info-value gold">Rs. ${Number(data.fee).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
                <div class="info-row"><span class="info-label">Your Balance</span><span class="info-value green">Rs. ${Number(data.senderNewBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
            </div>
        `);
        showToast("Transfer successful!");
    } catch (err) {
        showToast(err.message, true);
        showTransfer();
    }
}

// ─── Change PIN ───────────────────────────────────────────────
function showChangePin() {
    inputMode = "none";
    setStatus("CHANGE PIN");
    removeSideLabels();

    setupSideButtons(
        ["", "", "", "", "BACK", ""],
        ["", "", "", "", "CANCEL", ""]
    );
    leftBtns[4].onclick = () => showMenu();
    rightBtns[4].onclick = () => cancelTransaction();

    render(`
        <div class="pin-area">
            <div class="atm-subtitle">Enter current PIN</div>
            <div class="pin-dots">
                <div class="pin-dot" id="pd0"></div>
                <div class="pin-dot" id="pd1"></div>
                <div class="pin-dot" id="pd2"></div>
                <div class="pin-dot" id="pd3"></div>
            </div>
            <div class="input-display" style="width:240px; margin-top:16px;">
                <span id="inputValue"></span>
            </div>
            <div class="msg-error" id="pinMsg"></div>
        </div>
    `);

    // Override display for PIN dots
    window.updateInputDisplay = function() {
        const el = document.getElementById("inputValue");
        if (!el) return;
        el.innerHTML = "●".repeat(currentInput.length) + '<span class="cursor"></span>';
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`pd${i}`);
            if (dot) dot.classList.toggle("filled", i < currentInput.length);
        }
    };

    setTimeout(() => startInput("pin", (oldPin) => {
        window._changePinOld = oldPin;
        showChangePinNew();
    }), 100);
}

function showChangePinNew() {
    render(`
        <div class="pin-area">
            <div class="atm-subtitle">Enter new 4-digit PIN</div>
            <div class="pin-dots">
                <div class="pin-dot" id="pd0"></div>
                <div class="pin-dot" id="pd1"></div>
                <div class="pin-dot" id="pd2"></div>
                <div class="pin-dot" id="pd3"></div>
            </div>
            <div class="input-display" style="width:240px; margin-top:16px;">
                <span id="inputValue"></span>
            </div>
            <div class="msg-error" id="pinMsg"></div>
        </div>
    `);

    currentInput = "";
    updateInputDisplay();

    setTimeout(() => startInput("pin", (newPin) => {
        submitChangePin(window._changePinOld, newPin);
    }), 100);
}

async function submitChangePin(oldPin, newPin) {
    render(`<div class="spinner-wrap"><div class="spinner"></div><div class="spinner-text">Changing PIN...</div></div>`);
    restoreUpdateDisplay();

    try {
        await api("POST", "/api/account/change-pin", { oldPin, newPin });
        showToast("PIN changed successfully!");
        showMenu();
    } catch (err) {
        showToast(err.message, true);
        showMenu();
    }
}

// ─── Mini Statement ───────────────────────────────────────────
async function showMiniStatement() {
    inputMode = "none";
    setStatus("STATEMENT");
    removeSideLabels();

    setupSideButtons(["", "", "", "", "BACK", ""], ["", "", "", "", "", "EXIT"]);
    leftBtns[4].onclick = () => showMenu();
    rightBtns[5].onclick = () => cancelTransaction();

    render(`<div class="spinner-wrap"><div class="spinner"></div><div class="spinner-text">Loading statement...</div></div>`);

    try {
        const data = await api("GET", "/api/account/statement");
        let rows = data.transactions.map((t) => {
            const d = new Date(t.date);
            const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const dateStr = `${String(d.getDate()).padStart(2, "0")}-${months[d.getMonth()]}`;
            const sign = t.type === "DEPOSIT" || (t.type === "TRANSFER" && t.fee === 0) ? "+" : "-";
            return `
                <tr>
                    <td style="font-size:11px;">${t.transactionId}</td>
                    <td>${dateStr}</td>
                    <td><span style="color:${t.type === "DEPOSIT" ? "var(--emerald)" : "var(--gold)"}">${t.type}</span></td>
                    <td class="${sign === "+" ? "txn-positive" : "txn-negative"}">${sign} Rs. ${Number(t.amount).toLocaleString("en-IN")}</td>
                </tr>
            `;
        }).join("");

        render(`
            <div class="atm-section-title">MINI STATEMENT</div>
            <div style="font-size:11px; color:var(--gray); margin-bottom:12px;">
                Account: <span style="color:var(--white); font-family:var(--mono);">${data.accountNumber}</span> &nbsp;
                Type: <span style="color:var(--gold);">${data.accountType}</span>
            </div>
            <table class="txn-table">
                <thead><tr><th>ID</th><th>Date</th><th>Type</th><th>Amount</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--gray-dim);">No transactions</td></tr>'}</tbody>
            </table>
            <hr class="divider">
            <div class="info-row"><span class="info-label">Current Balance</span><span class="info-value green">Rs. ${Number(data.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span></div>
        `);
    } catch (err) {
        showToast(err.message, true);
        showMenu();
    }
}

// ─── Cancel / Eject ───────────────────────────────────────────
async function cancelTransaction() {
    inputMode = "none";
    restoreUpdateDisplay();
    removeSideLabels();
    try { await api("POST", "/api/card/eject"); } catch (e) {}
    sessionToken = null;
    linkedAccounts = [];
    showToast("Card ejected. Thank you!");
    showWelcome();
}

document.getElementById("btnEject").addEventListener("click", cancelTransaction);

// ─── Init ─────────────────────────────────────────────────────
showWelcome();
