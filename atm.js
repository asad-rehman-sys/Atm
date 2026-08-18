const { DenominationError, InsufficientATMFundsError } = require("./exceptions");

class ATM {
    constructor(name, location) {
        this._name = name;
        this._location = location;
        this._cash = { 500: 0, 1000: 0, 5000: 0 };
        this._insertedCard = null;
        this._isAuthenticated = false;
        this._selectedAccount = null;
    }

    get name() {
        return this._name;
    }

    get location() {
        return this._location;
    }

    get totalCash() {
        return (
            this._cash[500] * 500 +
            this._cash[1000] * 1000 +
            this._cash[5000] * 5000
        );
    }

    get cashDenominations() {
        return { ...this._cash };
    }

    get insertedCard() {
        return this._insertedCard;
    }

    get isAuthenticated() {
        return this._isAuthenticated;
    }

    get selectedAccount() {
        return this._selectedAccount;
    }

    loadCash(denominations) {
        for (const [note, count] of Object.entries(denominations)) {
            const val = Number(note);
            if (this._cash[val] !== undefined) {
                this._cash[val] += count;
            }
        }
    }

    insertCard(card) {
        this._insertedCard = card;
        this._isAuthenticated = false;
        this._selectedAccount = null;
    }

    ejectCard() {
        this._insertedCard = null;
        this._isAuthenticated = false;
        this._selectedAccount = null;
    }

    authenticate(pin) {
        if (!this._insertedCard) {
            return { success: false, message: "No card inserted." };
        }
        const result = this._insertedCard.validatePin(pin);
        if (result.valid) {
            this._isAuthenticated = true;
            return { success: true, message: "Authentication successful." };
        }
        if (result.blocked) {
            return {
                success: false,
                message: "Card blocked after 3 failed attempts.",
                blocked: true,
            };
        }
        return {
            success: false,
            message: `Invalid PIN. ${result.attemptsRemaining} attempt(s) remaining.`,
            attemptsRemaining: result.attemptsRemaining,
        };
    }

    selectAccount(accountNumber) {
        if (!this._isAuthenticated) {
            return { success: false, message: "Not authenticated." };
        }
        if (!this._insertedCard.linkedAccountNumbers.includes(accountNumber)) {
            return {
                success: false,
                message: "Account not linked to this card.",
            };
        }
        this._selectedAccount = accountNumber;
        return { success: true, message: `Account ${accountNumber} selected.` };
    }

    dispenseCash(amount) {
        if (amount <= 0 || amount % 500 !== 0) {
            throw new DenominationError();
        }

        const available = this.totalCash;
        if (amount > available) {
            throw new InsufficientATMFundsError(available, amount);
        }

        let remaining = amount;
        const dispensed = { 500: 0, 1000: 0, 5000: 0 };

        const notes = [5000, 1000, 500];
        for (const note of notes) {
            const needed = Math.floor(remaining / note);
            const take = Math.min(needed, this._cash[note]);
            dispensed[note] = take;
            remaining -= take * note;
        }

        if (remaining > 0) {
            throw new DenominationError();
        }

        for (const note of notes) {
            this._cash[note] -= dispensed[note];
        }

        return dispensed;
    }

    showCashStatus() {
        const total = this.totalCash;
        console.log("\n===== ATM CASH STATUS =====");
        console.log(`  500  x ${this._cash[500]}  = Rs. ${(this._cash[500] * 500).toLocaleString("en-IN")}`);
        console.log(` 1000  x ${this._cash[1000]}  = Rs. ${(this._cash[1000] * 1000).toLocaleString("en-IN")}`);
        console.log(` 5000  x ${this._cash[5000]}  = Rs. ${(this._cash[5000] * 5000).toLocaleString("en-IN")}`);
        console.log(`  Total Cash: Rs. ${total.toLocaleString("en-IN")}`);
        console.log("============================\n");
    }
}

module.exports = ATM;
