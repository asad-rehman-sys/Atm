class Card {
    static _nextNumber = 4000000000000000;

    constructor(customerId, pin) {
        Card._nextNumber += 1;
        this._cardNumber = String(Card._nextNumber);
        this._customerId = customerId;
        this._pin = String(pin).padStart(4, "0");
        this._isActive = true;
        this._failedPinAttempts = 0;
        this._maxPinAttempts = 3;
        this._linkedAccountNumbers = [];
    }

    get cardNumber() {
        return this._cardNumber;
    }

    get customerId() {
        return this._customerId;
    }

    get isActive() {
        return this._isActive;
    }

    get maskedCardNumber() {
        return "****-****-****-" + this._cardNumber.slice(-4);
    }

    get linkedAccountNumbers() {
        return [...this._linkedAccountNumbers];
    }

    linkAccount(accountNumber) {
        if (!this._linkedAccountNumbers.includes(accountNumber)) {
            this._linkedAccountNumbers.push(accountNumber);
        }
    }

    unlinkAccount(accountNumber) {
        this._linkedAccountNumbers = this._linkedAccountNumbers.filter(
            (a) => a !== accountNumber
        );
    }

    validatePin(enteredPin) {
        if (!this._isActive) {
            return { valid: false, blocked: true };
        }
        if (String(enteredPin) === this._pin) {
            this._failedPinAttempts = 0;
            return { valid: true, blocked: false };
        }
        this._failedPinAttempts += 1;
        if (this._failedPinAttempts >= this._maxPinAttempts) {
            this._isActive = false;
            return { valid: false, blocked: true };
        }
        return {
            valid: false,
            blocked: false,
            attemptsRemaining: this._maxPinAttempts - this._failedPinAttempts,
        };
    }

    changePin(oldPin, newPin) {
        if (String(oldPin) !== this._pin) {
            return false;
        }
        const pinStr = String(newPin);
        if (!/^\d{4}$/.test(pinStr)) {
            return false;
        }
        this._pin = pinStr;
        return true;
    }

    block() {
        this._isActive = false;
    }

    unblock() {
        this._isActive = true;
        this._failedPinAttempts = 0;
    }
}

module.exports = Card;
