# 👄 CupcakKeScript (`.cupcakke`)

> **The Sensual, Highly Explicit, and OOP-Equipped Programming Language & Web IDE**

Welcome to **CupcakKeScript**, a fully functional, custom-designed, expression-based programming language built from scratch. This language maps iconic CupcakKe lyrics into robust computer science constructs—supporting dynamic typing syntax, advanced Pratt-parsed expressions, error recovery catch scopes (`cpr`), and standard Object-Oriented Programming (OOP) class declarations (`papi`) with dynamic instance binding!

It features a high-fidelity **glassmorphic Web IDE dashboard** with a custom CRT console log, a reactive AST visualizer, synthetic Web Audio sound sweeps (gulp/moan cues), and a fully virtualized **File Tree VFS** that auto-saves your scripts in real-time to your browser's local storage.

---

## 🎨 Interactive VFS IDE Dashboard

The Web IDE provides a virtualized workspace environment:
* **Interactive File Management (CRUD)**: Create new custom `.cupcakke` files via the sidebar `📄+` control, select and edit active file tabs in the editor, and delete temporary files via `🗑️`.
* **State Persistence**: Your workspace is automatically backed up to **`localStorage`**, so all your custom scripts are preserved across tab reloads and browser sessions.
* **Context-Aware Execution**: Clicking **Run Script** immediately tokenizes, parses, and executes the active file in your editor tab!

---

## 💋 The Sensitive Keyword Map

The lexical scanner translates dynamic keywords loaded from `mapping_table.json`:

| Original Keyword | Dynamic Mapped Lyric | Semantic Meaning / Usage |
| :--- | :--- | :--- |
| `class` | `papi` | **OOP Class Declaration**. |
| `new` | `wet` | **Instantiation Operator** (e.g. `wet Toy()`). |
| `this` | `my_pussy` | **Self Reference Identifier** (dynamically bound). |
| `protected` | `condoms` | **Access Scope Level**. |
| `let` | `lick` | **Dynamic Variable / Object Declaration**. |
| `const` | `cumshot` | **Immutable Variable / Constant Declaration**. |
| `function` | `fuck` | **Function Declaration**. |
| `return` | `give_it_to_me_now` | **Return Statement**. |
| `print` | `squirt` | **Output Stream / Stdout Call**. |
| `input` | `gulp` | **Input Stream / Stdin Popup Reader**. |
| `if` | `slurp` | **Conditional (If)**. |
| `else` | `smack` | **Alternative Conditional (Else / Else If)**. |
| `while` | `deepthroat` | **Looping Construct (While)**. |
| `try` | `cpr` | **Exception Try Block**. |
| `catch` | `cream` | **Exception Recovery Catch Block**. |
| `split` | `slay` | **String/Array Split Helper** (e.g., `slay(text, ",")`). |
| `chopsticks` | `chopsticks` | **Array / String Index Accessor** (e.g., `arr chopsticks 2`). |
| `int` | `bitch` | Comfortable dynamic integer type annotation. |
| `string` | `swallow` | Comfortable dynamic string type annotation. |
| `double` | `nasty` | Comfortable dynamic floating-point type annotation. |
| `void` | `ass` | Comfortable dynamic empty return-type annotation. |

---

## 🍒 Code Examples

### 1. Variables, Expression & chopsticks Access
```cupcakke
bitch base_pleasure = 60;
cumshot climax_offset = 9;
bitch excitement = base_pleasure + climax_offset;

squirt("Excitement level:", excitement); // Prints 69!

lick toys = ["Lube", "Handcuffs", "Vanilla Pudding"];
lick favorite = toys chopsticks 2; // Accesses index 2 ("Vanilla Pudding")
squirt("Favorite toy is:", favorite);
```

### 🍓 2. slurp Conditionals & deepthroat Loops
```cupcakke
bitch countdown = 3;

deepthroat (countdown > 0) {
  squirt("🔥 Squeezing in...", countdown);
  countdown = countdown - 1;
}
squirt("💥 SPLASH! Give it to me now!");
```

### 🍑 3. OOP papi Classes & Method Calls
```cupcakke
papi Toy {
  swallow name;
  condoms excitement_level = 69;

  ass init(name_val) {
    my_pussy.name = name_val;
  }

  ass moan() {
    squirt("💦 Moan from", my_pussy.name, "- Excitement level is:", my_pussy.excitement_level);
  }
}

lick favorite = wet Toy("Pink Bullet");
favorite.moan(); // Output: 💦 Moan from Pink Bullet - Excitement level is: 69
```

---

## 🚀 Deployment to GitHub Pages (Static hosting)

Because this IDE's tree-walker interpreter and dynamic Virtual File System are built entirely on client-side vanilla JavaScript modules, **the playground requires zero backend databases/servers** and is **100% compatible with GitHub Pages**! 

Deploy your workspace globally in 4 quick steps:

1. **Initialize & Push to GitHub**:
   Create a new public repository on GitHub (e.g. `cupcakkescript-ide`). Initialize git locally in this project folder and push your files:
   ```bash
   git init
   git add .
   git commit -m "Initialize CupcakKeScript dynamic IDE workspace"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```
2. **Configure Pages Settings**:
   * Navigate to your repository page on **GitHub.com**.
   * Go to **Settings** (top navbar gear icon) -> **Pages** (in the sidebar under Code and automation).
   * Under **Build and deployment** -> **Source**, select **Deploy from a branch**.
   * Under **Branch**, select **`main`** and **`/ (root)`** folder, and click **Save**.
3. **Wait for Build**:
   GitHub will trigger an automated deployment action. After about 30 seconds, refresh the page.
4. **Access Anywhere!**:
   Your IDE is now hosted globally! Access it at:
   `https://YOUR_USERNAME.github.io/YOUR_REPOSITORY_NAME/`

---

## 🎮 Running Locally

### terminal interpreter CLI
Execute any `.cupcakke` file directly in your terminal using Node.js:
```bash
# Usage
node cli.js <filename.cupcakke>

# Example
node cli.js main.cupcakke
```

### local server IDE
Spin up a local static server to test changes before pushing to GitHub:
```bash
python3 -m http.server 8080
```
Then navigate to `http://localhost:8080` in your web browser.
