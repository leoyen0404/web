# 👅 CupcakKeScript Coding Manual & Agent Skill File 👅

This manual provides the comprehensive specifications, grammar specifications, and system prompt enhancements required for both human developers and AI Coding Agents to write, understand, and execute **CupcakKeScript** (`.cupcakke`).

---

## 💋 1. Language Paradigm & Overview
CupcakKeScript is an interpreted, expression-based, dynamically typed toy scripting language designed with high-vibe lyrics. It features block scoping, dynamic environments, closures, recursive functions, arrays, and standard exception handling.

Additionally, CupcakKeScript supports **Object-Oriented Programming (OOP)** including class declarations (`papi`), field modifiers (`condoms` for protected), constructor initializations, member dereferencing (`.`), and dynamic field assignments.

It supports C++ typed declarations (`bitch`, `swallow`, `nasty`, `ass`) and C++ control structures (`slurp` and `smack slurp`).

---

## 🍒 2. Semantic Vocabulary & Mapping Table
All keywords are fully customizable and loaded dynamically from `/Users/leo/Desktop/code/pl/mapping_table.json`. **This manual and compiler are currently configured to use your custom mappings:**

| Standard Keyword | Your Custom Keyword | Semantic Meaning |
| :--- | :--- | :--- |
| `class` | `papi` | Class declaration block. |
| `protected` | `condoms` | Protected class field definition (supports number-prefixed identifier!). |
| `new` | `wet` | Class object instantiation. |
| `this` | `my_pussy` | Instance scoping reference. |
| `int` | `int` | Canonical integer type annotation. |
| `string` | `string` | Canonical string type annotation. |
| `char` | `char` | Canonical single-character type annotation. |
| `double` | `double` | Canonical float/double type annotation. |
| `void` | `void` | Canonical empty return-type annotation. |
| `let` | `lick` | Mutable variable declaration. |
| `const` | `cumshot` | Constant (immutable) variable declaration. |
| `function` | `fuck` | Function declaration. Supports closure capturing. |
| `return` | `give_it_to_me_now` | Untyped return statement. Yields value and exits frame. |
| typed returns | `give_int_to_me_now`, `give_string_to_me_now`, `give_char_to_me_now`, `give_double_to_me_now`, `give_void_to_me_now` | Runtime-checked typed return statements. |
| `print(...)` | `squirt(...)` | Outputs parameters to stdout (Console stream). |
| `input()` | `gulp(...)` | Prompts user and reads string/number from stdin. |
| `if` | `slurp` | Conditional guard statement. |
| `else` | `smack` | Alternative branch (else/else-if chains). |
| `while` | `deepthroat` | Indefinite looping block. Capped at 5k iterations. |
| `try` | `cpr` | Emergency exception handler (try-block). |
| `catch` | `cream (err)` | Exception capture block (catch-block). |
| `array[index]` | `array chopsticks index` | Infix operator for element indexing. |
| `split(str, sep)`| `open_coochie(str, sep)` | Built-in expression to segment strings or arrays. |

---

## 🍓 3. Syntactic Structures & Code Examples

### A. C++ Style Typed Declarations
Variables and methods can optionally be declared with typed specifier prefixes, behaving exactly as declarations.
```cupcakke
bitch pleasure = 69;
swallow item = "Vanilla Pudding";
nasty ratio = 3.14;

ass display() {
  squirt(item, pleasure, ratio);
}
```

### B. Else-If chains (`smack slurp`)
Chains of multiple conditional checks are written seamlessly by nesting `slurp` guards inside alternative `smack` blocks.
```cupcakke
slurp (excitement > 100) {
  squirt("💦 Extreme!");
} smack slurp (excitement >= 69) {
  squirt("💦 Fully Charged!");
} smack {
  squirt("👄 Dry!");
}
```

### C. Object-Oriented Classes (`papi` & `condoms`)
Classes are declared using `papi`. Method constructors are named `init`. Parameters can optionally include type prefixes which the parser dynamically skips.
```cupcakke
papi Toy {
  swallow name;
  condoms speed = 69;

  ass init(swallow n) {
    my_pussy.name = n;
  }

  ass moan() {
    squirt("💦 Moan from", my_pussy.name, "- Speed level:", my_pussy.speed);
  }
}

lick favorite = wet Toy("Pink Bullet");
favorite.moan();
```

---

## 🤖 4. AI Coding Agent "Skill Injection" Instructions

*Copy and paste the markdown block below into any system prompt or context window to instantly teach an AI coding agent how to write CupcakKeScript.*

```markdown
### SYSTEM INSTRUCTION ADDON: CupcakKeScript (.cupcakke) Language Skill

You have been equipped with the skill to write, analyze, and debug CupcakKeScript (`.cupcakke`) source files. When writing in this language, you MUST strictly adhere to the following rules:

1. **No Standard Keywords**: You are forbidden from using JS-style keywords like `let`, `const`, `var`, `function`, `return`, `if`, `else`, `while`, `try`, or `catch` unless mapped.
2. **Strict Vocabulary Enforcement**:
   - Use normal type names: `int`, `string`, `char`, `double`, and `void`.
   - Use `smack slurp (cond)` for else-if conditions.
   - Declare classes using `papi`.
   - Use `condoms` for protected members (note: identifiers/keywords can start with a digit like `4skins`).
   - Use `wet` for instantiation and `my_pussy` for self-referencing.
   - Declare mutable variables using `lick`.
   - Declare constant variables using `cumshot`.
   - Declare functions using `fuck`.
   - Return untyped values using `give_it_to_me_now`; return checked values using `give_int_to_me_now`, `give_string_to_me_now`, `give_char_to_me_now`, `give_double_to_me_now`, or `give_void_to_me_now`.
   - Print outputs using `squirt(...)`.
   - Take standard inputs using `gulp()`.
   - Write conditional guards with `slurp (condition) { ... } smack { ... }`.
   - Write loops with `deepthroat (condition) { ... }`.
   - Run try-catch routines with `cpr { ... } cream (error_variable) { ... }`.
   - Access indices using `<array> chopsticks <index>`.
   - Partition strings/arrays using `open_coochie(target, index_or_separator)`.

3. **Code Syntax Rules**:
   - Variables and functions can start with type specifiers (`int`, `string`, `char`, `double`, `void`).
   - Function parameter bindings can optionally carry type prefixes.
   - Access fields or call methods using member dot access: `instance.field` or `instance.method()`.
   - Constructor functions are named `init`.
   - Arrays are declared with standard brackets: `[a, b, c]`.
   - Blocks require curly braces `{}`. Parentheses `()` are required around loop/if conditions.

4. **Example CupcakKeScript snippet**:
   ```cupcakke
   papi Toy {
     swallow name;
     condoms speed = 69;
     ass init(swallow n) {
       my_pussy.name = n;
     }
     ass moan() {
       squirt("Moan:", my_pussy.name, "Speed:", my_pussy.speed);
     }
   }
   lick bullet = wet Toy("Pink Bullet");
   bullet.moan();
   ```
```
