"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluate = evaluate;
const STRING_METHODS = new Set(["startsWith", "endsWith", "includes"]);
function tokenize(src) {
    const tokens = [];
    let i = 0;
    const isIdentStart = (c) => /[A-Za-z_$]/.test(c);
    const isIdentPart = (c) => /[A-Za-z0-9_$]/.test(c);
    while (i < src.length) {
        const c = src[i];
        if (/\s/.test(c)) {
            i++;
            continue;
        }
        if (c === '"' || c === "'") {
            const quote = c;
            let str = "";
            i++;
            while (i < src.length && src[i] !== quote) {
                if (src[i] === "\\" && i + 1 < src.length) {
                    str += src[i + 1];
                    i += 2;
                }
                else {
                    str += src[i];
                    i++;
                }
            }
            i++; // closing quote
            tokens.push({ kind: "str", value: str });
            continue;
        }
        if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
            let num = "";
            while (i < src.length && /[0-9.]/.test(src[i])) {
                num += src[i];
                i++;
            }
            tokens.push({ kind: "num", value: num });
            continue;
        }
        if (isIdentStart(c)) {
            let id = "";
            while (i < src.length && isIdentPart(src[i])) {
                id += src[i];
                i++;
            }
            tokens.push({ kind: "ident", value: id });
            continue;
        }
        // multi-char operators first
        const two = src.substr(i, 2);
        if (["==", "!=", ">=", "<=", "&&", "||"].includes(two)) {
            tokens.push({ kind: "op", value: two });
            i += 2;
            continue;
        }
        if ("()!<>.,".includes(c)) {
            tokens.push({ kind: "op", value: c });
            i++;
            continue;
        }
        throw new Error(`Unexpected character '${c}' in expression`);
    }
    tokens.push({ kind: "eof", value: "" });
    return tokens;
}
class Parser {
    constructor(tokens, ctx) {
        this.tokens = tokens;
        this.ctx = ctx;
        this.pos = 0;
    }
    peek() { return this.tokens[this.pos]; }
    next() { return this.tokens[this.pos++]; }
    expect(op) {
        const t = this.next();
        if (t.kind !== "op" || t.value !== op) {
            throw new Error(`Expected '${op}' but found '${t.value}'`);
        }
    }
    parse() {
        const v = this.parseOr();
        if (this.peek().kind !== "eof") {
            throw new Error(`Unexpected token '${this.peek().value}'`);
        }
        return v;
    }
    parseOr() {
        let left = this.parseAnd();
        while (this.peek().value === "||") {
            this.next();
            const right = this.parseAnd();
            left = truthy(left) || truthy(right);
        }
        return left;
    }
    parseAnd() {
        let left = this.parseEquality();
        while (this.peek().value === "&&") {
            this.next();
            const right = this.parseEquality();
            left = truthy(left) && truthy(right);
        }
        return left;
    }
    parseEquality() {
        let left = this.parseComparison();
        while (this.peek().value === "==" || this.peek().value === "!=") {
            const op = this.next().value;
            const right = this.parseComparison();
            left = op === "==" ? looseEq(left, right) : !looseEq(left, right);
        }
        return left;
    }
    parseComparison() {
        let left = this.parseUnary();
        while ([">", ">=", "<", "<="].includes(this.peek().value)) {
            const op = this.next().value;
            const right = this.parseUnary();
            const a = Number(left);
            const b = Number(right);
            switch (op) {
                case ">":
                    left = a > b;
                    break;
                case ">=":
                    left = a >= b;
                    break;
                case "<":
                    left = a < b;
                    break;
                case "<=":
                    left = a <= b;
                    break;
            }
        }
        return left;
    }
    parseUnary() {
        if (this.peek().value === "!") {
            this.next();
            return !truthy(this.parseUnary());
        }
        return this.parsePostfix();
    }
    parsePostfix() {
        let value = this.parsePrimary();
        // member access / method calls
        while (this.peek().value === ".") {
            this.next();
            const nameTok = this.next();
            if (nameTok.kind !== "ident") {
                throw new Error(`Expected property name after '.'`);
            }
            if (this.peek().value === "(") {
                // method call (whitelisted string methods only)
                this.next();
                const args = [];
                if (this.peek().value !== ")") {
                    args.push(this.parseOr());
                    while (this.peek().value === ",") {
                        this.next();
                        args.push(this.parseOr());
                    }
                }
                this.expect(")");
                value = callMethod(value, nameTok.value, args);
            }
            else {
                value = memberOf(value, nameTok.value);
            }
        }
        return value;
    }
    parsePrimary() {
        const t = this.peek();
        if (t.value === "(") {
            this.next();
            const v = this.parseOr();
            this.expect(")");
            return v;
        }
        if (t.kind === "num") {
            this.next();
            return Number(t.value);
        }
        if (t.kind === "str") {
            this.next();
            return t.value;
        }
        if (t.kind === "ident") {
            this.next();
            if (t.value === "true")
                return true;
            if (t.value === "false")
                return false;
            if (t.value === "null")
                return null;
            return memberOf(this.ctx, t.value);
        }
        throw new Error(`Unexpected token '${t.value}'`);
    }
}
function memberOf(obj, prop) {
    if (obj && typeof obj === "object" && prop in obj) {
        return obj[prop];
    }
    return undefined;
}
function callMethod(target, method, args) {
    if (!STRING_METHODS.has(method)) {
        throw new Error(`Method '${method}' is not allowed in expressions`);
    }
    const s = target === undefined || target === null ? "" : String(target);
    const arg = args[0] === undefined ? "" : String(args[0]);
    switch (method) {
        case "startsWith": return s.startsWith(arg);
        case "endsWith": return s.endsWith(arg);
        case "includes": return s.includes(arg);
        default: return false;
    }
}
function truthy(v) {
    return !!v;
}
function looseEq(a, b) {
    // eslint-disable-next-line eqeqeq
    return a == b;
}
/** Evaluate an expression against a context. Returns boolean truthiness.
 *  On parse/eval error, returns false and reports via onError. */
function evaluate(expr, ctx, onError) {
    try {
        const tokens = tokenize(expr);
        const result = new Parser(tokens, ctx).parse();
        return truthy(result);
    }
    catch (e) {
        onError?.(e instanceof Error ? e.message : String(e));
        return false;
    }
}
//# sourceMappingURL=expression.js.map