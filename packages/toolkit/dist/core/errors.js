export class P2LRNError extends Error {
    constructor(message, options) { super(message, options); this.name = new.target.name; }
}
export class ValidationError extends P2LRNError {
}
export class ReadError extends P2LRNError {
}
export class ProjectError extends P2LRNError {
}
//# sourceMappingURL=errors.js.map