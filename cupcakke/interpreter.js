/**
 * CupcakKeScript Core Interpreter (.cupcakke)
 * Features a Lexer, Pratt Parser, AST Representation, and Tree-Walking Evaluator.
 * Fully supports dynamic keyword mapping & Object-Oriented Programming (OOP) syntax.
 */

// --- TOKEN DEFINITIONS ---
const TokenType = {
  EOF: "EOF",
  ILLEGAL: "ILLEGAL",

  // Identifiers & Literals
  IDENT: "IDENT",
  NUMBER: "NUMBER",
  STRING: "STRING",

  // Operators
  ASSIGN: "ASSIGN", // =
  PLUS: "PLUS", // +
  MINUS: "MINUS", // -
  BANG: "BANG", // !
  ASTERISK: "ASTERISK", // *
  SLASH: "SLASH", // /
  MODULO: "MODULO", // %
  DOT: "DOT", // . (member reference access)

  // Logical / Comparison
  EQ: "EQ", // ==
  NOT_EQ: "NOT_EQ", // !=
  LT: "LT", // <
  GT: "GT", // >
  LTE: "LTE", // <=
  GTE: "GTE", // >=
  AND: "AND", // &&
  OR: "OR", // ||

  // Delimiters
  COMMA: "COMMA", // ,
  SEMICOLON: "SEMICOLON", // ;
  LPAREN: "LPAREN", // (
  RPAREN: "RPAREN", // )
  LBRACE: "LBRACE", // {
  RBRACE: "RBRACE", // }
  LBRACKET: "LBRACKET", // [
  RBRACKET: "RBRACKET", // ]

  // Keywords (Dynamic equivalents loaded from mapping_table.json)
  CLASS: "CLASS", // papi
  PROTECTED: "PROTECTED", // 4skins
  PUBLIC: "PUBLIC", // public
  PRIVATE: "PRIVATE", // private
  NEW: "NEW", // new
  THIS: "THIS", // this
  FUNCTION: "FUNCTION", // deepthroat
  RETURN: "RETURN", // give_it_to_me_now
  PRINT: "PRINT", // vanilla_pudding
  INPUT: "INPUT", // gulp
  IF: "IF", // smack
  ELSE: "ELSE", // vending_machine
  WHILE: "WHILE", // duck_duck_goose
  TRY: "TRY", // cpr
  SPLIT: "SPLIT", // open_coochie
  CHOPSTICKS: "CHOPSTICKS", // chopsticks (array index accessor)
  LET: "LET", // cxmshxt
  CONST: "CONST", // squirt
  INT: "INT",
  STRING_TYPE: "STRING_TYPE",
  CHAR: "CHAR",
  DOUBLE: "DOUBLE",
  VOID: "VOID",
  TRUE: "TRUE", // true
  FALSE: "FALSE", // false
  NULL: "NULL", // null
};

// Default mapping fallback dictionary
let MAPPINGS = {
  class: "papi",
  protected: "4skins",
  public: "public",
  private: "private",
  new: "new",
  this: "this",
  let: "cxmshxt",
  const: "squirt",
  function: "deepthroat",
  return: "give_it_to_me_now",
  print: "vanilla_pudding",
  input: "gulp",
  if: "smack",
  else: "vending_machine",
  while: "duck_duck_goose",
  try: "cpr",
  catch: "vending_machine",
  split: "open_coochie",
  chopsticks: "chopsticks",
  int: "int",
  string: "string",
  char: "char",
  double: "double",
  void: "void",
  typeAliases: {
    int: ["bitch", "cum_int"],
    string: ["swallow", "slurp_string"],
    double: ["nasty", "double_throat"],
    void: ["ass", "empty_box"],
  },
  typedReturns: {
    int: "give_int_to_me_now",
    string: "give_string_to_me_now",
    char: "give_char_to_me_now",
    double: "give_double_to_me_now",
    void: "give_void_to_me_now",
  },
};

// If running in Node environment, dynamically sync with mapping_table.json config file
if (typeof require !== "undefined") {
  try {
    const fs = require("fs");
    const path = require("path");
    const customPath = path.resolve(__dirname, "mapping_table.json");
    if (fs.existsSync(customPath)) {
      const data = JSON.parse(fs.readFileSync(customPath, "utf8"));
      MAPPINGS = { ...MAPPINGS, ...data };
    }
  } catch (e) {
    // Graceful fallback if file loading fails
  }
}

// Generate KEYWORDS token maps
let KEYWORDS = {};

function updateKeywords() {
  KEYWORDS = {};
  const addKeyword = (word, type) => {
    if (word) KEYWORDS[word] = type;
  };
  const addTypeAliases = (typeName, tokenType) => {
    addKeyword(typeName, tokenType);
    addKeyword(MAPPINGS[typeName], tokenType);
    (MAPPINGS.typeAliases?.[typeName] || []).forEach((alias) => addKeyword(alias, tokenType));
  };

  addKeyword(MAPPINGS.class, TokenType.CLASS);
  addKeyword(MAPPINGS.protected, TokenType.PROTECTED);
  addKeyword(MAPPINGS.public, TokenType.PUBLIC);
  addKeyword(MAPPINGS.private, TokenType.PRIVATE);
  addKeyword(MAPPINGS.new, TokenType.NEW);
  addKeyword(MAPPINGS.this, TokenType.THIS);
  addKeyword(MAPPINGS.let, TokenType.LET);
  addKeyword(MAPPINGS.const, TokenType.CONST);
  addKeyword(MAPPINGS.function, TokenType.FUNCTION);
  addKeyword(MAPPINGS.return, TokenType.RETURN);
  Object.values(MAPPINGS.typedReturns || {}).forEach((word) => addKeyword(word, TokenType.RETURN));
  addKeyword(MAPPINGS.print, TokenType.PRINT);
  addKeyword(MAPPINGS.input, TokenType.INPUT);
  addKeyword(MAPPINGS.if, TokenType.IF);
  addKeyword(MAPPINGS.else, TokenType.ELSE);
  addKeyword(MAPPINGS.while, TokenType.WHILE);
  addKeyword(MAPPINGS.try, TokenType.TRY);
  addKeyword(MAPPINGS.catch, TokenType.ELSE); // catch wraps else block
  addKeyword(MAPPINGS.split, TokenType.SPLIT);
  addKeyword(MAPPINGS.chopsticks, TokenType.CHOPSTICKS);
  addTypeAliases("int", TokenType.INT);
  addTypeAliases("string", TokenType.STRING_TYPE);
  addTypeAliases("char", TokenType.CHAR);
  addTypeAliases("double", TokenType.DOUBLE);
  addTypeAliases("void", TokenType.VOID);
  KEYWORDS["true"] = TokenType.TRUE;
  KEYWORDS["false"] = TokenType.FALSE;
  KEYWORDS["null"] = TokenType.NULL;
}

// Initial populate on script load
updateKeywords();

function returnTypeForKeyword(keyword) {
  const typedReturns = MAPPINGS.typedReturns || {};
  for (const [typeName, mappedKeyword] of Object.entries(typedReturns)) {
    if (keyword === mappedKeyword) return typeName;
  }
  return null;
}

function returnKeywordForType(typeName) {
  if (!typeName) return MAPPINGS.return;
  return MAPPINGS.typedReturns?.[typeName] || MAPPINGS.return;
}

function typeNameForToken(token) {
  if (!token) return null;
  switch (token.type) {
    case TokenType.INT:
      return "int";
    case TokenType.STRING_TYPE:
      return "string";
    case TokenType.CHAR:
      return "char";
    case TokenType.DOUBLE:
      return "double";
    case TokenType.VOID:
      return "void";
    default:
      return null;
  }
}

class Token {
  constructor(type, value, line, column) {
    this.type = type;
    this.value = value;
    this.line = line;
    this.column = column;
  }
}

// --- LEXER ---
class Lexer {
  constructor(input) {
    this.input = input;
    this.position = 0; // Current position in input
    this.readPosition = 0; // Next position
    this.ch = ""; // Current character
    this.line = 1;
    this.column = 0;

    this.readChar();
  }

  readChar() {
    if (this.readPosition >= this.input.length) {
      this.ch = "";
    } else {
      this.ch = this.input[this.readPosition];
    }
    this.position = this.readPosition;
    this.readPosition += 1;
    this.column += 1;
  }

  peekChar() {
    if (this.readPosition >= this.input.length) {
      return "";
    }
    return this.input[this.readPosition];
  }

  skipWhitespaceAndComments() {
    while (true) {
      if (this.ch === "\n") {
        this.line += 1;
        this.column = 0;
        this.readChar();
      } else if (this.ch === " " || this.ch === "\t" || this.ch === "\r") {
        this.readChar();
      } else if (this.ch === "/" && this.peekChar() === "/") {
        // Line comment
        while (this.ch !== "\n" && this.ch !== "") {
          this.readChar();
        }
      } else {
        break;
      }
    }
  }

  nextToken() {
    this.skipWhitespaceAndComments();

    let tok = null;
    const startLine = this.line;
    const startCol = this.column;

    switch (this.ch) {
      case "=":
        if (this.peekChar() === "=") {
          this.readChar();
          tok = new Token(TokenType.EQ, "==", startLine, startCol);
        } else {
          tok = new Token(TokenType.ASSIGN, "=", startLine, startCol);
        }
        break;
      case "+":
        tok = new Token(TokenType.PLUS, "+", startLine, startCol);
        break;
      case "-":
        tok = new Token(TokenType.MINUS, "-", startLine, startCol);
        break;
      case "!":
        if (this.peekChar() === "=") {
          this.readChar();
          tok = new Token(TokenType.NOT_EQ, "!=", startLine, startCol);
        } else {
          tok = new Token(TokenType.BANG, "!", startLine, startCol);
        }
        break;
      case "*":
        tok = new Token(TokenType.ASTERISK, "*", startLine, startCol);
        break;
      case "/":
        tok = new Token(TokenType.SLASH, "/", startLine, startCol);
        break;
      case "%":
        tok = new Token(TokenType.MODULO, "%", startLine, startCol);
        break;
      case ".":
        tok = new Token(TokenType.DOT, ".", startLine, startCol);
        break;
      case "<":
        if (this.peekChar() === "=") {
          this.readChar();
          tok = new Token(TokenType.LTE, "<=", startLine, startCol);
        } else {
          tok = new Token(TokenType.LT, "<", startLine, startCol);
        }
        break;
      case ">":
        if (this.peekChar() === "=") {
          this.readChar();
          tok = new Token(TokenType.GTE, ">=", startLine, startCol);
        } else {
          tok = new Token(TokenType.GT, ">", startLine, startCol);
        }
        break;
      case "&":
        if (this.peekChar() === "&") {
          this.readChar();
          tok = new Token(TokenType.AND, "&&", startLine, startCol);
        } else {
          tok = new Token(TokenType.ILLEGAL, "&", startLine, startCol);
        }
        break;
      case "|":
        if (this.peekChar() === "|") {
          this.readChar();
          tok = new Token(TokenType.OR, "||", startLine, startCol);
        } else {
          tok = new Token(TokenType.ILLEGAL, "|", startLine, startCol);
        }
        break;
      case ",":
        tok = new Token(TokenType.COMMA, ",", startLine, startCol);
        break;
      case ";":
        tok = new Token(TokenType.SEMICOLON, ";", startLine, startCol);
        break;
      case "(":
        tok = new Token(TokenType.LPAREN, "(", startLine, startCol);
        break;
      case ")":
        tok = new Token(TokenType.RPAREN, ")", startLine, startCol);
        break;
      case "{":
        tok = new Token(TokenType.LBRACE, "{", startLine, startCol);
        break;
      case "}":
        tok = new Token(TokenType.RBRACE, "}", startLine, startCol);
        break;
      case "[":
        tok = new Token(TokenType.LBRACKET, "[", startLine, startCol);
        break;
      case "]":
        tok = new Token(TokenType.RBRACKET, "]", startLine, startCol);
        break;
      case '"':
      case "'":
        tok = this.readString(this.ch, startLine, startCol);
        break;
      case "":
        tok = new Token(TokenType.EOF, "", startLine, startCol);
        break;
      default:
        // Support Alphanumeric words (letters, digits, underscores)
        // Enables identifiers to start with numbers (e.g. 4skins)
        if (this.isDigit(this.ch)) {
          const val = this.readNumberOrWord();
          if (this.isValidNumber(val)) {
            return new Token(TokenType.NUMBER, val, startLine, startCol);
          }
          const type = KEYWORDS[val] || TokenType.IDENT;
          return new Token(type, val, startLine, startCol);
        } else if (this.isAlphanumericOrUnderscore(this.ch)) {
          const val = this.readWord();
          const type = KEYWORDS[val] || TokenType.IDENT;
          return new Token(type, val, startLine, startCol);
        } else {
          tok = new Token(TokenType.ILLEGAL, this.ch, startLine, startCol);
        }
    }

    this.readChar();
    return tok;
  }

  isAlphanumericOrUnderscore(ch) {
    return (
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_"
    );
  }

  readWord() {
    const startPos = this.position;
    while (this.isAlphanumericOrUnderscore(this.ch)) {
      this.readChar();
    }
    return this.input.slice(startPos, this.position);
  }

  readNumberOrWord() {
    const startPos = this.position;
    while (this.isDigit(this.ch)) {
      this.readChar();
    }
    if (this.ch === "." && this.isDigit(this.peekChar())) {
      this.readChar();
      while (this.isDigit(this.ch)) {
        this.readChar();
      }
      return this.input.slice(startPos, this.position);
    }
    if (this.isAlphanumericOrUnderscore(this.ch)) {
      while (this.isAlphanumericOrUnderscore(this.ch)) {
        this.readChar();
      }
    }
    return this.input.slice(startPos, this.position);
  }

  isDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  isValidNumber(str) {
    // Match purely digits or decimal numeric expressions (42, 3.14)
    return /^\d+(\.\d+)?$/.test(str);
  }

  readString(quoteChar, startLine, startCol) {
    let str = "";
    this.readChar(); // Skip quote
    while (this.ch !== quoteChar && this.ch !== "") {
      if (this.ch === "\n") {
        this.line += 1;
        this.column = 0;
      }
      if (this.ch === "\\") {
        this.readChar();
        if (this.ch === "n") str += "\n";
        else if (this.ch === "t") str += "\t";
        else if (this.ch === "r") str += "\r";
        else str += this.ch;
      } else {
        str += this.ch;
      }
      this.readChar();
    }
    return new Token(TokenType.STRING, str, startLine, startCol);
  }
}

// --- AST CLASSES ---
class ASTNode {
  toString() {
    return "";
  }
}

class Program extends ASTNode {
  constructor() {
    super();
    this.statements = [];
  }
  toString() {
    return this.statements.map((s) => s.toString()).join("\n");
  }
}

class LetStatement extends ASTNode {
  constructor(token, name, value, isConst = false) {
    super();
    this.token = token;
    this.name = name;
    this.value = value;
    this.isConst = isConst;
  }
  toString() {
    return `${this.isConst ? MAPPINGS.const : MAPPINGS.let} ${this.name.toString()} = ${this.value ? this.value.toString() : ""};`;
  }
}

class AssignStatement extends ASTNode {
  constructor(token, name, value) {
    super();
    this.token = token;
    this.name = name; // Identifier or DotExpression
    this.value = value;
  }
  toString() {
    return `${this.name.toString()} = ${this.value.toString()};`;
  }
}

class ReturnStatement extends ASTNode {
  constructor(token, returnValue, returnType = null) {
    super();
    this.token = token;
    this.returnValue = returnValue;
    this.returnType = returnType;
  }
  toString() {
    return `${returnKeywordForType(this.returnType)} ${this.returnValue ? this.returnValue.toString() : ""};`;
  }
}

class PrintStatement extends ASTNode {
  constructor(token, args) {
    super();
    this.token = token;
    this.args = args;
  }
  toString() {
    return `${MAPPINGS.print}(${this.args.map((a) => a.toString()).join(", ")});`;
  }
}

class ExpressionStatement extends ASTNode {
  constructor(token, expression) {
    super();
    this.token = token;
    this.expression = expression;
  }
  toString() {
    return this.expression ? this.expression.toString() : "";
  }
}

class BlockStatement extends ASTNode {
  constructor(token) {
    super();
    this.token = token;
    this.statements = [];
  }
  toString() {
    return `{ ${this.statements.map((s) => s.toString()).join(" ")} }`;
  }
}

class IfStatement extends ASTNode {
  constructor(token, condition, consequence, alternative = null) {
    super();
    this.token = token;
    this.condition = condition;
    this.consequence = consequence;
    this.alternative = alternative;
  }
  toString() {
    let out = `${MAPPINGS.if} (${this.condition.toString()}) ${this.consequence.toString()}`;
    if (this.alternative) {
      out += ` ${MAPPINGS.else} ${this.alternative.toString()}`;
    }
    return out;
  }
}

class WhileStatement extends ASTNode {
  constructor(token, condition, body) {
    super();
    this.token = token;
    this.condition = condition;
    this.body = body;
  }
  toString() {
    return `${MAPPINGS.while} (${this.condition.toString()}) ${this.body.toString()}`;
  }
}

class TryCatchStatement extends ASTNode {
  constructor(token, tryBlock, catchBlock, errorVar = null) {
    super();
    this.token = token;
    this.tryBlock = tryBlock;
    this.catchBlock = catchBlock;
    this.errorVar = errorVar;
  }
  toString() {
    let catchPart = this.errorVar ? `(${this.errorVar.toString()})` : "";
    return `${MAPPINGS.try} ${this.tryBlock.toString()} ${MAPPINGS.else} ${catchPart} ${this.catchBlock.toString()}`;
  }
}

class ClassDeclaration extends ASTNode {
  constructor(token, name, body) {
    super();
    this.token = token; // TokenType.CLASS
    this.name = name; // Identifier
    this.body = body; // BlockStatement
  }
  toString() {
    return `${MAPPINGS.class} ${this.name.toString()} ${this.body.toString()}`;
  }
}

class FunctionDeclaration extends ASTNode {
  constructor(token, name, parameters, body, returnType = null) {
    super();
    this.token = token;
    this.name = name;
    this.parameters = parameters;
    this.body = body;
    this.returnType = returnType;
  }
  toString() {
    const params = this.parameters.map((p) => p.toString()).join(", ");
    const nameStr = this.name ? ` ${this.name.toString()}` : "";
    const prefix = this.returnType ? `${this.returnType} ` : MAPPINGS.function;
    return `${prefix}${nameStr}(${params}) ${this.body.toString()}`;
  }
}

class Identifier extends ASTNode {
  constructor(token, value) {
    super();
    this.token = token;
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

class NumberLiteral extends ASTNode {
  constructor(token, value) {
    super();
    this.token = token;
    this.value = value;
  }
  toString() {
    return this.value.toString();
  }
}

class StringLiteral extends ASTNode {
  constructor(token, value) {
    super();
    this.token = token;
    this.value = value;
  }
  toString() {
    return `"${this.value}"`;
  }
}

class BooleanLiteral extends ASTNode {
  constructor(token, value) {
    super();
    this.token = token;
    this.value = value;
  }
  toString() {
    return this.value ? "true" : "false";
  }
}

class NullLiteral extends ASTNode {
  constructor(token) {
    super();
    this.token = token;
  }
  toString() {
    return "null";
  }
}

class ArrayLiteral extends ASTNode {
  constructor(token, elements) {
    super();
    this.token = token;
    this.elements = elements;
  }
  toString() {
    return `[${this.elements.map((el) => el.toString()).join(", ")}]`;
  }
}

class PrefixExpression extends ASTNode {
  constructor(token, operator, right) {
    super();
    this.token = token;
    this.operator = operator;
    this.right = right;
  }
  toString() {
    return `(${this.operator}${this.right.toString()})`;
  }
}

class InfixExpression extends ASTNode {
  constructor(token, left, operator, right) {
    super();
    this.token = token;
    this.left = left;
    this.operator = operator;
    this.right = right;
  }
  toString() {
    return `(${this.left.toString()} ${this.operator} ${this.right.toString()})`;
  }
}

class IndexExpression extends ASTNode {
  constructor(token, left, index) {
    super();
    this.token = token;
    this.left = left;
    this.index = index;
  }
  toString() {
    return `(${this.left.toString()} chopsticks ${this.index.toString()})`;
  }
}

class DotExpression extends ASTNode {
  constructor(token, left, right) {
    super();
    this.token = token; // TokenType.DOT
    this.left = left;
    this.right = right; // Identifier Node
  }
  toString() {
    return `${this.left.toString()}.${this.right.toString()}`;
  }
}

class NewExpression extends ASTNode {
  constructor(token, className, args) {
    super();
    this.token = token; // TokenType.NEW
    this.className = className; // Identifier
    this.args = args; // Array of Expression Nodes
  }
  toString() {
    return `${MAPPINGS.new} ${this.className.toString()}(${this.args.map(a => a.toString()).join(", ")})`;
  }
}

class CallExpression extends ASTNode {
  constructor(token, functionNode, args) {
    super();
    this.token = token;
    this.functionNode = functionNode;
    this.args = args;
  }
  toString() {
    return `${this.functionNode.toString()}(${this.args.map((a) => a.toString()).join(", ")})`;
  }
}

class InputExpression extends ASTNode {
  constructor(token, promptMsg) {
    super();
    this.token = token;
    this.promptMsg = promptMsg;
  }
  toString() {
    return `${MAPPINGS.input}(${this.promptMsg ? this.promptMsg.toString() : ""})`;
  }
}

class SplitExpression extends ASTNode {
  constructor(token, target, separator) {
    super();
    this.token = token;
    this.target = target;
    this.separator = separator;
  }
  toString() {
    return `${MAPPINGS.split}(${this.target.toString()}, ${this.separator.toString()})`;
  }
}

// --- PARSER ---
const Precedence = {
  LOWEST: 1,
  OR: 2, // ||
  AND: 3, // &&
  EQUALS: 4, // ==, !=
  LESSGREATER: 5, // >, <, >=, <=
  SUM: 6, // +, -
  PRODUCT: 7, // *, /, %
  PREFIX: 8, // !x, -x
  CALL: 9, // fn()
  INDEX: 10, // chopsticks accessor
  DOT: 11, // member reference: instance.member
};

const TOKEN_PRECEDENCE = {
  [TokenType.OR]: Precedence.OR,
  [TokenType.AND]: Precedence.AND,
  [TokenType.EQ]: Precedence.EQUALS,
  [TokenType.NOT_EQ]: Precedence.EQUALS,
  [TokenType.LT]: Precedence.LESSGREATER,
  [TokenType.GT]: Precedence.LESSGREATER,
  [TokenType.LTE]: Precedence.LESSGREATER,
  [TokenType.GTE]: Precedence.LESSGREATER,
  [TokenType.PLUS]: Precedence.SUM,
  [TokenType.MINUS]: Precedence.SUM,
  [TokenType.ASTERISK]: Precedence.PRODUCT,
  [TokenType.SLASH]: Precedence.PRODUCT,
  [TokenType.MODULO]: Precedence.PRODUCT,
  [TokenType.LPAREN]: Precedence.CALL,
  [TokenType.CHOPSTICKS]: Precedence.INDEX,
  [TokenType.DOT]: Precedence.DOT,
};

class Parser {
  constructor(lexer) {
    this.lexer = lexer;
    this.curToken = null;
    this.peekToken = null;
    this.doublePeekToken = null;
    this.errors = [];

    // Prefix Parse Functions
    this.prefixParseFns = {};
    this.registerPrefix(TokenType.IDENT, () => this.parseIdentifier());
    this.registerPrefix(TokenType.THIS, () => this.parseIdentifier()); // Treat 'this' like Identifier
    this.registerPrefix(TokenType.NUMBER, () => this.parseNumberLiteral());
    this.registerPrefix(TokenType.STRING, () => this.parseStringLiteral());
    this.registerPrefix(TokenType.TRUE, () => this.parseBooleanLiteral());
    this.registerPrefix(TokenType.FALSE, () => this.parseBooleanLiteral());
    this.registerPrefix(TokenType.NULL, () => this.parseNullLiteral());
    this.registerPrefix(TokenType.LPAREN, () => this.parseGroupedExpression());
    this.registerPrefix(TokenType.LBRACKET, () => this.parseArrayLiteral());
    this.registerPrefix(TokenType.BANG, () => this.parsePrefixExpression());
    this.registerPrefix(TokenType.MINUS, () => this.parsePrefixExpression());
    this.registerPrefix(TokenType.FUNCTION, () => this.parseFunctionLiteral());
    this.registerPrefix(TokenType.INPUT, () => this.parseInputExpression());
    this.registerPrefix(TokenType.SPLIT, () => this.parseSplitExpression());
    this.registerPrefix(TokenType.NEW, () => this.parseNewExpression());

    // Infix Parse Functions
    this.infixParseFns = {};
    this.registerInfix(TokenType.PLUS, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.MINUS, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.ASTERISK, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.SLASH, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.MODULO, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.EQ, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.NOT_EQ, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.LT, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.GT, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.LTE, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.GTE, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.AND, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.OR, (left) => this.parseInfixExpression(left));
    this.registerInfix(TokenType.LPAREN, (left) => this.parseCallExpression(left));
    this.registerInfix(TokenType.CHOPSTICKS, (left) => this.parseIndexExpression(left));
    this.registerInfix(TokenType.DOT, (left) => this.parseDotExpression(left));

    // Get first three tokens to populate triple-buffer
    this.nextToken();
    this.nextToken();
    this.nextToken();
  }

  registerPrefix(type, fn) {
    this.prefixParseFns[type] = fn;
  }

  registerInfix(type, fn) {
    this.infixParseFns[type] = fn;
  }

  nextToken() {
    this.curToken = this.peekToken;
    this.peekToken = this.doublePeekToken;
    this.doublePeekToken = this.lexer.nextToken();
  }

  curTokenIs(type) {
    return this.curToken && this.curToken.type === type;
  }

  peekTokenIs(type) {
    return this.peekToken && this.peekToken.type === type;
  }

  doublePeekTokenIs(type) {
    return this.doublePeekToken && this.doublePeekToken.type === type;
  }

  expectPeek(type) {
    if (this.peekTokenIs(type)) {
      this.nextToken();
      return true;
    }
    this.peekError(type);
    return false;
  }

  peekPrecedence() {
    return TOKEN_PRECEDENCE[this.peekToken.type] || Precedence.LOWEST;
  }

  curPrecedence() {
    return TOKEN_PRECEDENCE[this.curToken.type] || Precedence.LOWEST;
  }

  peekError(type) {
    const msg = `Line ${this.peekToken.line}:${this.peekToken.column} - Expected next token to be "${type}", got "${this.peekToken.type}" instead`;
    this.errors.push(msg);
  }

  parseProgram() {
    const program = new Program();
    while (!this.curTokenIs(TokenType.EOF)) {
      const stmt = this.parseStatement();
      if (stmt) {
        program.statements.push(stmt);
      }
      this.nextToken();
    }
    return program;
  }

  parseStatement() {
    switch (this.curToken.type) {
      case TokenType.LET:
      case TokenType.CONST:
      case TokenType.PROTECTED:
      case TokenType.PUBLIC:
      case TokenType.PRIVATE:
      case TokenType.INT:
      case TokenType.STRING_TYPE:
      case TokenType.CHAR:
      case TokenType.DOUBLE:
      case TokenType.VOID:
        // If followed by an LPAREN after identifier (lookahead), it is a typed function!
        if (this.doublePeekTokenIs(TokenType.LPAREN)) {
          return this.parseFunctionDeclarationWithType();
        }
        return this.parseLetStatement();
      case TokenType.CLASS:
        return this.parseClassDeclaration();
      case TokenType.RETURN:
        return this.parseReturnStatement();
      case TokenType.PRINT:
        return this.parsePrintStatement();
      case TokenType.IF:
        return this.parseIfStatement();
      case TokenType.WHILE:
        return this.parseWhileStatement();
      case TokenType.TRY:
        return this.parseTryCatchStatement();
      case TokenType.FUNCTION:
        if (this.peekTokenIs(TokenType.IDENT)) {
          return this.parseFunctionDeclaration();
        }
        return this.parseExpressionStatement();
      case TokenType.IDENT:
      case TokenType.THIS:
        if (this.peekTokenIs(TokenType.ASSIGN) || this.peekTokenIs(TokenType.DOT)) {
          return this.parseAssignStatement();
        }
        return this.parseExpressionStatement();
      default:
        return this.parseExpressionStatement();
    }
  }

  parseLetStatement() {
    const isConst = this.curTokenIs(TokenType.CONST);
    const tok = this.curToken; // let / const / protected

    if (!this.expectPeek(TokenType.IDENT)) {
      return null;
    }

    const name = new Identifier(this.curToken, this.curToken.value);

    // Initializer is optional for class fields, but required for standalone declarations
    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
      return new LetStatement(tok, name, null, isConst);
    }

    if (!this.expectPeek(TokenType.ASSIGN)) {
      // If no assignment, it is a declaration without default value (class scope)
      return new LetStatement(tok, name, null, isConst);
    }

    this.nextToken(); // skip '='
    const value = this.parseExpression(Precedence.LOWEST);

    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }

    return new LetStatement(tok, name, value, isConst);
  }

  parseClassDeclaration() {
    const tok = this.curToken; // 'papi'
    if (!this.expectPeek(TokenType.IDENT)) {
      return null;
    }
    const name = new Identifier(this.curToken, this.curToken.value);
    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }
    const body = this.parseBlockStatement();
    return new ClassDeclaration(tok, name, body);
  }

  parseAssignStatement() {
    // Parse target with LOWEST precedence to allow dot access and subscripts
    const target = this.parseExpression(Precedence.LOWEST);
    
    if (this.peekTokenIs(TokenType.ASSIGN)) {
      this.nextToken(); // consume target ending token, curToken is now '='
      const tok = this.curToken; // '='
      this.nextToken(); // consume '='
      const value = this.parseExpression(Precedence.LOWEST);

      if (this.peekTokenIs(TokenType.SEMICOLON)) {
        this.nextToken();
      }
      return new AssignStatement(tok, target, value);
    }
    
    // Pure member expression statement (e.g. favorite.moan();)
    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }
    return new ExpressionStatement(target.token, target);
  }

  parseReturnStatement() {
    const tok = this.curToken;
    this.nextToken(); // consume 'give_it_to_me_now'

    let value = null;
    if (!this.curTokenIs(TokenType.SEMICOLON)) {
      value = this.parseExpression(Precedence.LOWEST);
    }

    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }

    return new ReturnStatement(tok, value, returnTypeForKeyword(tok.value));
  }

  parsePrintStatement() {
    const tok = this.curToken; // 'vanilla_pudding'
    this.nextToken(); // consume 'vanilla_pudding'

    let args = [];
    if (this.curTokenIs(TokenType.LPAREN)) {
      this.nextToken(); // consume '('
      if (!this.curTokenIs(TokenType.RPAREN)) {
        args.push(this.parseExpression(Precedence.LOWEST));
        while (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken(); // consume current expr
          this.nextToken(); // consume ','
          args.push(this.parseExpression(Precedence.LOWEST));
        }
        if (!this.expectPeek(TokenType.RPAREN)) {
          return null;
        }
      } else {
        this.nextToken(); // consume ')'
      }
    } else {
      if (!this.curTokenIs(TokenType.SEMICOLON) && !this.curTokenIs(TokenType.EOF)) {
        args.push(this.parseExpression(Precedence.LOWEST));
        while (this.peekTokenIs(TokenType.COMMA)) {
          this.nextToken(); // consume current expr
          this.nextToken(); // consume ','
          args.push(this.parseExpression(Precedence.LOWEST));
        }
      }
    }

    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }
    return new PrintStatement(tok, args);
  }

  parseExpressionStatement() {
    const tok = this.curToken;
    const expr = this.parseExpression(Precedence.LOWEST);

    if (this.peekTokenIs(TokenType.SEMICOLON)) {
      this.nextToken();
    }

    return new ExpressionStatement(tok, expr);
  }

  parseBlockStatement() {
    const tok = this.curToken;
    const block = new BlockStatement(tok);
    this.nextToken(); // consume '{'

    while (!this.curTokenIs(TokenType.RBRACE) && !this.curTokenIs(TokenType.EOF)) {
      const stmt = this.parseStatement();
      if (stmt) {
        block.statements.push(stmt);
      }
      this.nextToken();
    }

    if (!this.curTokenIs(TokenType.RBRACE)) {
      this.errors.push(`Line ${this.curToken.line}:${this.curToken.column} - Missing closing curly brace "}" for block statement`);
      return null;
    }

    return block;
  }

  parseIfStatement() {
    const tok = this.curToken; // 'smack'

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    this.nextToken(); // skip '('
    const condition = this.parseExpression(Precedence.LOWEST);

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    const consequence = this.parseBlockStatement();
    let alternative = null;

    if (this.peekTokenIs(TokenType.ELSE)) {
      this.nextToken(); // consume 'vending_machine' keyword
      if (this.peekTokenIs(TokenType.IF)) {
        this.nextToken();
        alternative = this.parseIfStatement();
      } else {
        if (!this.expectPeek(TokenType.LBRACE)) {
          return null;
        }
        alternative = this.parseBlockStatement();
      }
    }

    return new IfStatement(tok, condition, consequence, alternative);
  }

  parseWhileStatement() {
    const tok = this.curToken; // 'duck_duck_goose'

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    this.nextToken(); // skip '('
    const condition = this.parseExpression(Precedence.LOWEST);

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    const body = this.parseBlockStatement();
    return new WhileStatement(tok, condition, body);
  }

  parseTryCatchStatement() {
    const tok = this.curToken; // 'cpr'
    
    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }
    const tryBlock = this.parseBlockStatement();

    let catchBlock = null;
    let errorVar = null;

    if (this.expectPeek(TokenType.ELSE)) {
      // vending_machine
      if (this.peekTokenIs(TokenType.LPAREN)) {
        this.nextToken(); // consume '('
        if (!this.expectPeek(TokenType.IDENT)) {
          return null;
        }
        errorVar = new Identifier(this.curToken, this.curToken.value);
        if (!this.expectPeek(TokenType.RPAREN)) {
          return null;
        }
      }
      if (!this.expectPeek(TokenType.LBRACE)) {
        return null;
      }
      catchBlock = this.parseBlockStatement();
    } else {
      this.errors.push(`Line ${this.curToken.line}:${this.curToken.column} - "cpr" statement requires a corresponding "vending_machine" catch block`);
      return null;
    }

    return new TryCatchStatement(tok, tryBlock, catchBlock, errorVar);
  }

  parseFunctionDeclaration() {
    const tok = this.curToken; // 'deepthroat'
    this.nextToken(); // consume 'deepthroat'

    const name = new Identifier(this.curToken, this.curToken.value);

    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    const parameters = this.parseFunctionParameters();

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    const body = this.parseBlockStatement();
    return new FunctionDeclaration(tok, name, parameters, body, null);
  }

  parseFunctionDeclarationWithType() {
    const typeTok = this.curToken; // C++ type specifier keyword (e.g. empty_box)
    this.nextToken(); // consume type, curToken is now the function name identifier
    const name = new Identifier(this.curToken, this.curToken.value);
    
    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }
    const parameters = this.parseFunctionParameters();
    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }
    const body = this.parseBlockStatement();
    return new FunctionDeclaration(typeTok, name, parameters, body, typeNameForToken(typeTok));
  }

  isTypeToken(type) {
    return (
      type === TokenType.INT ||
      type === TokenType.STRING_TYPE ||
      type === TokenType.CHAR ||
      type === TokenType.DOUBLE ||
      type === TokenType.VOID ||
      type === TokenType.LET ||
      type === TokenType.CONST ||
      type === TokenType.PROTECTED ||
      type === TokenType.PUBLIC ||
      type === TokenType.PRIVATE
    );
  }

  parseFunctionParameters() {
    const params = [];
    if (this.peekTokenIs(TokenType.RPAREN)) {
      this.nextToken();
      return params;
    }

    this.nextToken(); // consume LPAREN or preceding comma

    // If followed by type, skip type to capture parameter name!
    let nameToken = this.curToken;
    if (this.isTypeToken(this.curToken.type) && this.peekTokenIs(TokenType.IDENT)) {
      this.nextToken(); // skip type specifier
      nameToken = this.curToken;
    }

    const ident = new Identifier(nameToken, nameToken.value);
    params.push(ident);

    while (this.peekTokenIs(TokenType.COMMA)) {
      this.nextToken(); // consume COMMA
      this.nextToken(); // curToken is now parameter name or type
      let nextNameToken = this.curToken;
      if (this.isTypeToken(this.curToken.type) && this.peekTokenIs(TokenType.IDENT)) {
        this.nextToken(); // skip type specifier
        nextNameToken = this.curToken;
      }
      
      const nextIdent = new Identifier(nextNameToken, nextNameToken.value);
      params.push(nextIdent);
    }

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    return params;
  }

  parseExpression(precedence) {
    const prefix = this.prefixParseFns[this.curToken.type];
    if (!prefix) {
      this.errors.push(`Line ${this.curToken.line}:${this.curToken.column} - No parsing rule found for token type "${this.curToken.type}"`);
      return null;
    }

    let leftExp = prefix();

    while (!this.peekTokenIs(TokenType.SEMICOLON) && precedence < this.peekPrecedence()) {
      const infix = this.infixParseFns[this.peekToken.type];
      if (!infix) {
        return leftExp;
      }
      this.nextToken();
      leftExp = infix(leftExp);
    }

    return leftExp;
  }

  parseIdentifier() {
    return new Identifier(this.curToken, this.curToken.value);
  }

  parseNumberLiteral() {
    return new NumberLiteral(this.curToken, parseFloat(this.curToken.value));
  }

  parseStringLiteral() {
    return new StringLiteral(this.curToken, this.curToken.value);
  }

  parseBooleanLiteral() {
    return new BooleanLiteral(this.curToken, this.curTokenIs(TokenType.TRUE));
  }

  parseNullLiteral() {
    return new NullLiteral(this.curToken);
  }

  parseGroupedExpression() {
    this.nextToken(); // consume '('
    const expr = this.parseExpression(Precedence.LOWEST);
    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }
    return expr;
  }

  parseArrayLiteral() {
    const tok = this.curToken;
    const elements = [];

    if (this.peekTokenIs(TokenType.RBRACKET)) {
      this.nextToken();
      return new ArrayLiteral(tok, elements);
    }

    this.nextToken(); // skip '['
    elements.push(this.parseExpression(Precedence.LOWEST));

    while (this.peekTokenIs(TokenType.COMMA)) {
      this.nextToken(); // consume previous expr
      this.nextToken(); // consume ','
      elements.push(this.parseExpression(Precedence.LOWEST));
    }

    if (!this.expectPeek(TokenType.RBRACKET)) {
      return null;
    }

    return new ArrayLiteral(tok, elements);
  }

  parsePrefixExpression() {
    const tok = this.curToken;
    const operator = this.curToken.value;
    this.nextToken(); // consume operator
    const right = this.parseExpression(Precedence.PREFIX);
    return new PrefixExpression(tok, operator, right);
  }

  parseInfixExpression(left) {
    const tok = this.curToken;
    const operator = this.curToken.value;
    const precedence = this.curPrecedence();
    this.nextToken(); // consume operator
    const right = this.parseExpression(precedence);
    return new InfixExpression(tok, left, operator, right);
  }

  parseIndexExpression(left) {
    const tok = this.curToken; // 'chopsticks'
    this.nextToken(); // consume 'chopsticks'
    const right = this.parseExpression(Precedence.INDEX);
    return new IndexExpression(tok, left, right);
  }

  parseDotExpression(left) {
    const tok = this.curToken; // '.'
    this.nextToken(); // consume '.'
    if (!this.curTokenIs(TokenType.IDENT)) {
      this.errors.push(`Line ${this.curToken.line}:${this.curToken.column} - Expected identifier after "." member accessor, got "${this.curToken.type}"`);
      return null;
    }
    const right = new Identifier(this.curToken, this.curToken.value);
    return new DotExpression(tok, left, right);
  }

  parseNewExpression() {
    const tok = this.curToken; // 'new'
    if (!this.expectPeek(TokenType.IDENT)) {
      return null;
    }
    const className = new Identifier(this.curToken, this.curToken.value);
    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }
    const args = this.parseCallArguments();
    return new NewExpression(tok, className, args);
  }

  parseCallExpression(left) {
    const tok = this.curToken; // '('
    const args = this.parseCallArguments();
    return new CallExpression(tok, left, args);
  }

  parseCallArguments() {
    const args = [];
    if (this.peekTokenIs(TokenType.RPAREN)) {
      this.nextToken();
      return args;
    }

    this.nextToken(); // skip '('
    args.push(this.parseExpression(Precedence.LOWEST));

    while (this.peekTokenIs(TokenType.COMMA)) {
      this.nextToken(); // consume expression
      this.nextToken(); // consume ','
      args.push(this.parseExpression(Precedence.LOWEST));
    }

    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }

    return args;
  }

  parseFunctionLiteral() {
    const tok = this.curToken; // 'deepthroat'
    
    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }

    const parameters = this.parseFunctionParameters();

    if (!this.expectPeek(TokenType.LBRACE)) {
      return null;
    }

    const body = this.parseBlockStatement();
    return new FunctionDeclaration(tok, null, parameters, body, null);
  }

  parseInputExpression() {
    const tok = this.curToken; // 'gulp'
    let promptMsg = null;
    if (this.peekTokenIs(TokenType.LPAREN)) {
      this.nextToken(); // consume 'gulp'
      if (this.peekTokenIs(TokenType.RPAREN)) {
        this.nextToken(); // consume '('
      } else {
        this.nextToken(); // consume '('
        promptMsg = this.parseExpression(Precedence.LOWEST);
        if (!this.expectPeek(TokenType.RPAREN)) {
          return null;
        }
      }
    }
    return new InputExpression(tok, promptMsg);
  }

  parseSplitExpression() {
    const tok = this.curToken; // 'open_coochie'
    if (!this.expectPeek(TokenType.LPAREN)) {
      return null;
    }
    this.nextToken(); // consume '('
    const target = this.parseExpression(Precedence.LOWEST);
    if (!this.expectPeek(TokenType.COMMA)) {
      return null;
    }
    this.nextToken(); // consume ','
    const separator = this.parseExpression(Precedence.LOWEST);
    if (!this.expectPeek(TokenType.RPAREN)) {
      return null;
    }
    return new SplitExpression(tok, target, separator);
  }
}

// --- EVALUATOR OBJECTS & ENVIRONMENT ---
const ObjectType = {
  NUMBER: "NUMBER",
  STRING: "STRING",
  BOOLEAN: "BOOLEAN",
  NULL: "NULL",
  ARRAY: "ARRAY",
  CLASS_DEF: "CLASS_DEF",
  INSTANCE: "INSTANCE",
  BOUND_METHOD: "BOUND_METHOD",
  FUNCTION: "FUNCTION",
  BUILTIN: "BUILTIN",
  RETURN_VALUE: "RETURN_VALUE",
  ERROR: "ERROR",
};

class Obj {
  constructor(type, value) {
    this.type = type;
    this.value = value;
  }
  inspect() {
    return String(this.value);
  }
}

class NumberObj extends Obj {
  constructor(val) {
    super(ObjectType.NUMBER, val);
  }
}

class StringObj extends Obj {
  constructor(val) {
    super(ObjectType.STRING, val);
  }
  inspect() {
    return this.value;
  }
}

class BooleanObj extends Obj {
  constructor(val) {
    super(ObjectType.BOOLEAN, val);
  }
}

class NullObj extends Obj {
  constructor() {
    super(ObjectType.NULL, null);
  }
  inspect() {
    return "null";
  }
}

class ArrayObj extends Obj {
  constructor(elements) {
    super(ObjectType.ARRAY, elements);
  }
  inspect() {
    return `[${this.value.map((el) => el.inspect()).join(", ")}]`;
  }
}

class ClassObj extends Obj {
  constructor(name, body, env) {
    super(ObjectType.CLASS_DEF, null);
    this.name = name; // string name
    this.body = body; // BlockStatement
    this.env = env; // Environment context
  }
  inspect() {
    return `papi ${this.name} { ... }`;
  }
}

class InstanceObj extends Obj {
  constructor(classObj) {
    super(ObjectType.INSTANCE, null);
    this.classObj = classObj;
    this.fields = {};
    this.methods = {};
  }
  inspect() {
    return `instance of papi ${this.classObj.name}`;
  }
}

class BoundMethodObj extends Obj {
  constructor(instance, method) {
    super(ObjectType.BOUND_METHOD, null);
    this.instance = instance;
    this.method = method; // FunctionObj
  }
  inspect() {
    return this.method.inspect();
  }
}

class ReturnObj extends Obj {
  constructor(val, returnType = null) {
    super(ObjectType.RETURN_VALUE, val);
    this.returnType = returnType;
  }
}

class ErrorObj extends Obj {
  constructor(msg, line = 0, col = 0) {
    super(ObjectType.ERROR, msg);
    this.line = line;
    this.col = col;
  }
  inspect() {
    return `👄 CupcakKeRuntimeError: ${this.value} (Line ${this.line}:${this.col})`;
  }
}

class FunctionObj extends Obj {
  constructor(parameters, body, env, returnType = null) {
    super(ObjectType.FUNCTION, null);
    this.parameters = parameters;
    this.body = body;
    this.env = env;
    this.returnType = returnType;
  }
  inspect() {
    const params = this.parameters.map((p) => p.toString()).join(", ");
    return `deepthroat(${params}) { ... }`;
  }
}

class BuiltinObj extends Obj {
  constructor(fn) {
    super(ObjectType.BUILTIN, fn);
  }
  inspect() {
    return "builtin function";
  }
}

// Scoping Environment
class Environment {
  constructor(outer = null) {
    this.store = {};
    this.constants = new Set();
    this.outer = outer;
  }

  get(name) {
    if (name in this.store) {
      return this.store[name];
    }
    if (this.outer) {
      return this.outer.get(name);
    }
    return null;
  }

  set(name, val, isConst = false) {
    if (this.constants.has(name)) {
      return new ErrorObj(`Cannot reassign constant variable "${name}"`);
    }
    this.store[name] = val;
    if (isConst) {
      this.constants.add(name);
    }
    return val;
  }

  assign(name, val) {
    if (this.constants.has(name)) {
      return new ErrorObj(`Cannot reassign constant variable "${name}"`);
    }
    if (name in this.store) {
      this.store[name] = val;
      return val;
    }
    if (this.outer) {
      return this.outer.assign(name, val);
    }
    return new ErrorObj(`Variable "${name}" is not defined`);
  }
}

// --- EVALUATOR ---
class Evaluator {
  constructor(options = {}) {
    this.stdout = options.stdout || ((msg) => console.log(msg));
    this.stdin = options.stdin || (() => prompt("👅 GULP Input:"));
    this.globals = new Environment();
    this.setupBuiltins();
  }

  setupBuiltins() {
    // len
    this.globals.set("len", new BuiltinObj((args) => {
      if (args.length !== 1) {
        return new ErrorObj(`len requires exactly 1 argument, got ${args.length}`);
      }
      const arg = args[0];
      if (arg.type === ObjectType.ARRAY || arg.type === ObjectType.STRING) {
        return new NumberObj(arg.value.length);
      }
      return new ErrorObj(`len() operand must be a string or array, got ${arg.type}`);
    }));

    // push
    this.globals.set("push", new BuiltinObj((args) => {
      if (args.length !== 2) {
        return new ErrorObj("push requires 2 arguments: push(array, element)");
      }
      const arr = args[0];
      const el = args[1];
      if (arr.type !== ObjectType.ARRAY) {
        return new ErrorObj(`push target must be an array, got ${arr.type}`);
      }
      arr.value.push(el);
      return arr;
    }));
  }

  async evaluate(node, env) {
    if (!node) return new NullObj();

    switch (node.constructor) {
      case Program:
        return this.evalProgram(node, env);

      case ExpressionStatement:
        return this.evaluate(node.expression, env);

      case NumberLiteral:
        return new NumberObj(node.value);

      case StringLiteral:
        return new StringObj(node.value);

      case BooleanLiteral:
        return new BooleanObj(node.value);

      case NullLiteral:
        return new NullObj();

      case ArrayLiteral:
        const elements = await this.evalExpressions(node.elements, env);
        if (elements.length === 1 && elements[0].type === ObjectType.ERROR) {
          return elements[0];
        }
        return new ArrayObj(elements);

      case Identifier:
        return this.evalIdentifier(node, env);

      case LetStatement: {
        let val = new NullObj();
        if (node.value) {
          val = await this.evaluate(node.value, env);
          if (val.type === ObjectType.ERROR) return val;
        }
        const res = env.set(node.name.value, val, node.isConst);
        if (res.type === ObjectType.ERROR) return res;
        return new NullObj();
      }

      case AssignStatement: {
        const val = await this.evaluate(node.value, env);
        if (val.type === ObjectType.ERROR) return val;

        // Check if member assignment: instance.field = value;
        if (node.name instanceof DotExpression) {
          const left = await this.evaluate(node.name.left, env);
          if (left.type === ObjectType.ERROR) return left;
          if (left.type !== ObjectType.INSTANCE) {
            return new ErrorObj("Member assignment target is not a class instance", node.token.line, node.token.column);
          }
          const fieldName = node.name.right.value;
          left.fields[fieldName] = val;
          return new NullObj();
        }

        const res = env.assign(node.name.value, val);
        if (res.type === ObjectType.ERROR) {
          res.line = node.token.line;
          res.col = node.token.column;
          return res;
        }
        return new NullObj();
      }

      case ReturnStatement: {
        const val = node.returnValue ? await this.evaluate(node.returnValue, env) : new NullObj();
        if (val.type === ObjectType.ERROR) return val;
        const typeError = this.validateTypedReturn(val, node.returnType, node.token.line, node.token.column);
        if (typeError) return typeError;
        return new ReturnObj(val, node.returnType);
      }

      case PrintStatement: {
        const args = await this.evalExpressions(node.args, env);
        if (args.length === 1 && args[0].type === ObjectType.ERROR) {
          return args[0];
        }
        const output = args.map((arg) => arg.inspect()).join(" ");
        this.stdout(output);
        return new NullObj();
      }

      case InputExpression: {
        let promptVal = "👅 GULP Input:";
        if (node.promptMsg) {
          const val = await this.evaluate(node.promptMsg, env);
          if (val.type === ObjectType.ERROR) return val;
          promptVal = val.inspect();
        }
        const userInput = (await this.stdin(promptVal)) || "";
        if (!isNaN(userInput) && userInput.trim() !== "") {
          return new NumberObj(parseFloat(userInput));
        }
        return new StringObj(userInput);
      }

      case SplitExpression: {
        const target = await this.evaluate(node.target, env);
        if (target.type === ObjectType.ERROR) return target;
        const separator = await this.evaluate(node.separator, env);
        if (separator.type === ObjectType.ERROR) return separator;

        if (target.type === ObjectType.STRING) {
          const sep = separator.inspect();
          const parts = target.value.split(sep);
          return new ArrayObj(parts.map((p) => new StringObj(p)));
        } else if (target.type === ObjectType.ARRAY) {
          const idx = separator.value;
          if (typeof idx !== "number") {
            return new ErrorObj("open_coochie requires a number index to partition an array", node.token.line, node.token.column);
          }
          const left = target.value.slice(0, idx);
          const right = target.value.slice(idx);
          return new ArrayObj([new ArrayObj(left), new ArrayObj(right)]);
        }
        return new ErrorObj("open_coochie can only be applied to String or Array values", node.token.line, node.token.column);
      }

      case ClassDeclaration: {
        const classObj = new ClassObj(node.name.value, node.body, env);
        env.set(node.name.value, classObj, false);
        return new NullObj();
      }

      case NewExpression: {
        const classObj = env.get(node.className.value);
        if (!classObj || classObj.type !== ObjectType.CLASS_DEF) {
          return new ErrorObj(`Class "${node.className.value}" is not defined. Did you declare your papi?`, node.token.line, node.token.column);
        }
        
        // Instantiate Class Obj
        const instance = new InstanceObj(classObj);
        
        // Initialize Fields & Methods in instance scope
        const classEnv = new Environment(classObj.env);
        for (const stmt of classObj.body.statements) {
          if (stmt instanceof FunctionDeclaration) {
            const method = new FunctionObj(stmt.parameters, stmt.body, classEnv, stmt.returnType);
            instance.methods[stmt.name.value] = method;
          } else if (stmt instanceof LetStatement) {
            let defaultVal = new NullObj();
            if (stmt.value) {
              defaultVal = await this.evaluate(stmt.value, classEnv);
              if (defaultVal.type === ObjectType.ERROR) return defaultVal;
            }
            instance.fields[stmt.name.value] = defaultVal;
          }
        }

        // Call initializer/constructor if present (e.g. init method)
        const initMethod = instance.methods["init"] || instance.methods[classObj.name];
        if (initMethod) {
          const args = await this.evalExpressions(node.args, env);
          if (args.length === 1 && args[0].type === ObjectType.ERROR) {
            return args[0];
          }
          
          const extendedEnv = this.extendFunctionEnv(initMethod, args);
          extendedEnv.set(MAPPINGS.this, instance, true); // bind 'this'
          
          const evaluated = await this.evaluate(initMethod.body, extendedEnv);
          if (evaluated.type === ObjectType.ERROR) return evaluated;
        }
        
        return instance;
      }

      case DotExpression: {
        const left = await this.evaluate(node.left, env);
        if (left.type === ObjectType.ERROR) return left;

        if (left.type !== ObjectType.INSTANCE) {
          return new ErrorObj(`Dot member access "." left-hand is not a class instance, got "${left.type}"`, node.token.line, node.token.column);
        }

        const fieldName = node.right.value;

        // 1. Check fields
        if (fieldName in left.fields) {
          return left.fields[fieldName];
        }

        // 2. Check methods
        if (fieldName in left.methods) {
          const method = left.methods[fieldName];
          return new BoundMethodObj(left, method);
        }

        return new ErrorObj(`Member "${fieldName}" is not defined on class "${left.classObj.name}"`, node.token.line, node.token.column);
      }

      case PrefixExpression: {
        const right = await this.evaluate(node.right, env);
        if (right.type === ObjectType.ERROR) return right;
        return this.evalPrefixExpression(node.operator, right, node.token.line, node.token.column);
      }

      case InfixExpression: {
        const left = await this.evaluate(node.left, env);
        if (left.type === ObjectType.ERROR) return left;
        const right = await this.evaluate(node.right, env);
        if (right.type === ObjectType.ERROR) return right;
        return this.evalInfixExpression(node.operator, left, right, node.token.line, node.token.column);
      }

      case IndexExpression: {
        const left = await this.evaluate(node.left, env);
        if (left.type === ObjectType.ERROR) return left;
        const index = await this.evaluate(node.index, env);
        if (index.type === ObjectType.ERROR) return index;
        return this.evalIndexExpression(left, index, node.token.line, node.token.column);
      }

      case BlockStatement:
        return this.evalBlockStatement(node, env);

      case IfStatement:
        return this.evalIfStatement(node, env);

      case WhileStatement:
        return this.evalWhileStatement(node, env);

      case TryCatchStatement:
        return this.evalTryCatchStatement(node, env);

      case FunctionDeclaration: {
        const func = new FunctionObj(node.parameters, node.body, env, node.returnType);
        if (node.name) {
          env.set(node.name.value, func, false);
          return new NullObj();
        }
        return func;
      }

      case CallExpression: {
        const func = await this.evaluate(node.functionNode, env);
        if (func.type === ObjectType.ERROR) return func;

        const args = await this.evalExpressions(node.args, env);
        if (args.length === 1 && args[0].type === ObjectType.ERROR) {
          return args[0];
        }

        return await this.applyFunction(func, args, node.token.line, node.token.column);
      }

      default:
        return new ErrorObj(`Unknown AST Node class type: "${node.constructor.name}"`);
    }
  }

  async evalProgram(program, env) {
    let result = new NullObj();
    for (const stmt of program.statements) {
      result = await this.evaluate(stmt, env);

      if (result.type === ObjectType.RETURN_VALUE) {
        return result.value;
      } else if (result.type === ObjectType.ERROR) {
        return result;
      }
    }
    return result;
  }

  async evalBlockStatement(block, env) {
    let result = new NullObj();
    for (const stmt of block.statements) {
      result = await this.evaluate(stmt, env);
      if (result && (result.type === ObjectType.RETURN_VALUE || result.type === ObjectType.ERROR)) {
        return result;
      }
    }
    return result;
  }

  evalIdentifier(node, env) {
    const val = env.get(node.value);
    if (!val) {
      return new ErrorObj(`Identifier "${node.value}" is not defined`, node.token.line, node.token.column);
    }
    return val;
  }

  async evalExpressions(exps, env) {
    const result = [];
    for (const e of exps) {
      const evaluated = await this.evaluate(e, env);
      if (evaluated.type === ObjectType.ERROR) {
        return [evaluated];
      }
      result.push(evaluated);
    }
    return result;
  }

  evalPrefixExpression(operator, right, line, col) {
    switch (operator) {
      case "!":
        return this.evalBangOperatorExpression(right);
      case "-":
        return this.evalMinusPrefixOperatorExpression(right, line, col);
      default:
        return new ErrorObj(`Unknown prefix operator: ${operator}`, line, col);
    }
  }

  evalBangOperatorExpression(right) {
    if (right.type === ObjectType.BOOLEAN) {
      return new BooleanObj(!right.value);
    }
    if (right.type === ObjectType.NULL) {
      return new BooleanObj(true);
    }
    return new BooleanObj(false);
  }

  evalMinusPrefixOperatorExpression(right, line, col) {
    if (right.type !== ObjectType.NUMBER) {
      return new ErrorObj(`Cannot apply negation operator "-" on non-number type: ${right.type}`, line, col);
    }
    return new NumberObj(-right.value);
  }

  evalInfixExpression(operator, left, right, line, col) {
    if (left.type === ObjectType.NUMBER && right.type === ObjectType.NUMBER) {
      return this.evalNumberInfixExpression(operator, left, right, line, col);
    }
    if (left.type === ObjectType.STRING || right.type === ObjectType.STRING) {
      return this.evalStringInfixExpression(operator, left, right, line, col);
    }
    if (operator === "==") {
      return new BooleanObj(left.value === right.value);
    }
    if (operator === "!=") {
      return new BooleanObj(left.value !== right.value);
    }
    if (operator === "&&") {
      return new BooleanObj(this.isTruthy(left) && this.isTruthy(right));
    }
    if (operator === "||") {
      return new BooleanObj(this.isTruthy(left) || this.isTruthy(right));
    }
    if (left.type !== right.type) {
      return new ErrorObj(`Type mismatch: ${left.type} ${operator} ${right.type}`, line, col);
    }
    return new ErrorObj(`Unknown operator: ${left.type} ${operator} ${right.type}`, line, col);
  }

  isTruthy(obj) {
    if (obj.type === ObjectType.BOOLEAN) return obj.value;
    if (obj.type === ObjectType.NULL) return false;
    return true;
  }

  evalNumberInfixExpression(operator, left, right, line, col) {
    const leftVal = left.value;
    const rightVal = right.value;

    switch (operator) {
      case "+":
        return new NumberObj(leftVal + rightVal);
      case "-":
        return new NumberObj(leftVal - rightVal);
      case "*":
        return new NumberObj(leftVal * rightVal);
      case "/":
        if (rightVal === 0) {
          return new ErrorObj("Division by zero! 👄 That coochie is tight but we can't divide by zero!", line, col);
        }
        return new NumberObj(leftVal / rightVal);
      case "%":
        return new NumberObj(leftVal % rightVal);
      case "<":
        return new BooleanObj(leftVal < rightVal);
      case ">":
        return new BooleanObj(leftVal > rightVal);
      case "<=":
        return new BooleanObj(leftVal <= rightVal);
      case ">=":
        return new BooleanObj(leftVal >= rightVal);
      case "==":
        return new BooleanObj(leftVal === rightVal);
      case "!=":
        return new BooleanObj(leftVal !== rightVal);
      default:
        return new ErrorObj(`Unknown operator for numbers: ${operator}`, line, col);
    }
  }

  evalStringInfixExpression(operator, left, right, line, col) {
    if (operator === "+") {
      return new StringObj(left.inspect() + right.inspect());
    }
    if (operator === "==") {
      return new BooleanObj(left.value === right.value);
    }
    if (operator === "!=") {
      return new BooleanObj(left.value !== right.value);
    }
    return new ErrorObj(`Operator ${operator} is not supported for Strings`, line, col);
  }

  evalIndexExpression(left, index, line, col) {
    if (left.type === ObjectType.ARRAY && index.type === ObjectType.NUMBER) {
      const arr = left.value;
      const idx = index.value;
      const max = arr.length - 1;
      if (idx < 0 || idx > max) {
        return new NullObj();
      }
      return arr[idx];
    }
    if (left.type === ObjectType.STRING && index.type === ObjectType.NUMBER) {
      const str = left.value;
      const idx = index.value;
      if (idx < 0 || idx >= str.length) {
        return new NullObj();
      }
      return new StringObj(str[idx]);
    }
    return new ErrorObj(`Index operator "chopsticks" is not supported for ${left.type} index by ${index.type}`, line, col);
  }

  async evalIfStatement(node, env) {
    const condition = await this.evaluate(node.condition, env);
    if (condition.type === ObjectType.ERROR) return condition;

    if (this.isTruthy(condition)) {
      return await this.evaluate(node.consequence, env);
    } else if (node.alternative) {
      return await this.evaluate(node.alternative, env);
    }
    return new NullObj();
  }

  async evalWhileStatement(node, env) {
    let result = new NullObj();
    let condition = await this.evaluate(node.condition, env);
    if (condition.type === ObjectType.ERROR) return condition;

    let loops = 0;
    while (this.isTruthy(condition)) {
      loops += 1;
      if (loops > 5000) {
        return new ErrorObj("Lips are tired! Infinite loop detected (capped at 5,000 runs)", node.token.line, node.token.column);
      }
      result = await this.evaluate(node.body, env);
      if (result && (result.type === ObjectType.RETURN_VALUE || result.type === ObjectType.ERROR)) {
        return result;
      }
      condition = await this.evaluate(node.condition, env);
      if (condition.type === ObjectType.ERROR) return condition;
    }
    return result;
  }

  async evalTryCatchStatement(node, env) {
    const tryEnv = new Environment(env);
    const result = await this.evaluate(node.tryBlock, tryEnv);

    if (result.type === ObjectType.ERROR) {
      const catchEnv = new Environment(env);
      if (node.errorVar) {
        catchEnv.set(node.errorVar.value, new StringObj(result.value), true);
      }
      return await this.evaluate(node.catchBlock, catchEnv);
    }
    return result;
  }

  async applyFunction(func, args, line, col) {
    if (func.type === ObjectType.BUILTIN) {
      const res = func.value(args);
      if (res.type === ObjectType.ERROR) {
        res.line = line;
        res.col = col;
      }
      return res;
    }

    if (func.type === ObjectType.BOUND_METHOD) {
      const method = func.method;
      if (method.parameters.length !== args.length) {
        return new ErrorObj(`Arguments length mismatch: method expects ${method.parameters.length} but got ${args.length}`, line, col);
      }
      const extendedEnv = this.extendFunctionEnv(method, args);
      extendedEnv.set(MAPPINGS.this, func.instance, true); // Bind dynamic 'this' context!
      const evaluated = await this.evaluate(method.body, extendedEnv);
      return this.unwrapReturnValue(evaluated, method.returnType, line, col);
    }

    if (func.type === ObjectType.FUNCTION) {
      if (func.parameters.length !== args.length) {
        return new ErrorObj(`Arguments length mismatch: function expects ${func.parameters.length} but got ${args.length}`, line, col);
      }

      const extendedEnv = this.extendFunctionEnv(func, args);
      const evaluated = await this.evaluate(func.body, extendedEnv);
      return this.unwrapReturnValue(evaluated, func.returnType, line, col);
    }

    return new ErrorObj(`Type "${func.type}" is not callable. Did you mean to deepthroat a function or class?`, line, col);
  }

  extendFunctionEnv(func, args) {
    const env = new Environment(func.env);
    for (let i = 0; i < func.parameters.length; i++) {
      env.set(func.parameters[i].value, args[i], false);
    }
    return env;
  }

  validateTypedReturn(value, expectedType, line = 0, col = 0) {
    if (!expectedType) return null;

    const actualType = this.valueTypeName(value);
    if (expectedType === "void") {
      return actualType === "void"
        ? null
        : new ErrorObj(`Expected void return, got ${actualType}`, line, col);
    }
    if (expectedType === "double" && actualType === "int") return null;
    if (expectedType === actualType) return null;
    return new ErrorObj(`Expected ${expectedType} return, got ${actualType}`, line, col);
  }

  valueTypeName(value) {
    if (!value || value.type === ObjectType.NULL) return "void";
    if (value.type === ObjectType.NUMBER) return Number.isInteger(value.value) ? "int" : "double";
    if (value.type === ObjectType.STRING) return value.value.length === 1 ? "char" : "string";
    if (value.type === ObjectType.BOOLEAN) return "boolean";
    if (value.type === ObjectType.ARRAY) return "array";
    if (value.type === ObjectType.INSTANCE) return "instance";
    if (value.type === ObjectType.FUNCTION) return "function";
    if (value.type === ObjectType.BOUND_METHOD) return "function";
    return String(value.type || "unknown").toLowerCase();
  }

  unwrapReturnValue(obj, expectedType = null, line = 0, col = 0) {
    if (obj.type === ObjectType.ERROR) return obj;
    if (obj.type === ObjectType.RETURN_VALUE) {
      if (obj.returnType && expectedType && obj.returnType !== expectedType) {
        return new ErrorObj(`Function declared ${expectedType} but returned ${obj.returnType}`, line, col);
      }
      const typeError = this.validateTypedReturn(obj.value, expectedType, line, col);
      if (typeError) return typeError;
      return obj.value;
    }
    if (expectedType && expectedType !== "void") {
      return new ErrorObj(`Function declared ${expectedType} but did not return a value`, line, col);
    }
    return obj;
  }
}

// --- MODULE EXPORTS (Node and Browser compatible) ---
const CupcakKe = {
  MAPPINGS,
  updateKeywords,
  TokenType,
  Token,
  Lexer,
  Parser,
  Evaluator,
  Environment,
  ObjectType,
  AST: {
    Program,
    LetStatement,
    AssignStatement,
    ReturnStatement,
    PrintStatement,
    ExpressionStatement,
    BlockStatement,
    IfStatement,
    WhileStatement,
    TryCatchStatement,
    ClassDeclaration,
    FunctionDeclaration,
    Identifier,
    NumberLiteral,
    StringLiteral,
    BooleanLiteral,
    NullLiteral,
    ArrayLiteral,
    PrefixExpression,
    InfixExpression,
    IndexExpression,
    DotExpression,
    NewExpression,
    CallExpression,
    InputExpression,
    SplitExpression,
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = CupcakKe;
}
if (typeof window !== "undefined") {
  window.CupcakKe = CupcakKe;
}
if (typeof globalThis !== "undefined") {
  globalThis.CupcakKe = CupcakKe;
}
