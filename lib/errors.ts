// Thrown inside a seat transaction when the conditional update changed fewer rows
// than the number of seats requested (a seat is taken, expired or not held by this user).
// Routes check for it with `instanceof`, so rewording the message cannot break the check.
export class SeatsUnavailableError extends Error {
    constructor(message = "One or more seats are no longer available") {
        super(message)
        this.name = "SeatsUnavailableError"
    }
}