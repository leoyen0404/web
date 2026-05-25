/**
   💋 CUPCAKKESCRIPT IDE CLIENT RUNTIME (app.js)
   Controls editor syncing, console rendering, audio synthesis, and interpreter execution.
 */

document.addEventListener("DOMContentLoaded", () => {
  const codeEditor = document.getElementById("code-editor");
  const lineNumbers = document.getElementById("line-numbers");
  const runBtn = document.getElementById("run-btn");
  const clearConsoleBtn = document.getElementById("clear-console-btn");
  const clearEditorBtn = document.getElementById("clear-editor-btn");
  const resetEditorBtn = document.getElementById("reset-editor-btn");
  const consoleOutput = document.getElementById("console-output");
  const astOutput = document.getElementById("ast-output");
  const exampleSelect = document.getElementById("example-select");
  const audioToggleBtn = document.getElementById("audio-toggle-btn");
  const activeFilename = document.getElementById("active-filename");
  const newFileBtn = document.getElementById("new-file-btn");
  const deleteFileBtn = document.getElementById("delete-file-btn");

  // Resolve global CupcakKe compiler object safely
  const CupcakKe = window.CupcakKe || globalThis.CupcakKe;

  // Audio state
  let audioEnabled = true;
  let audioCtx = null;

  // Track code state
  let originalShowcase = "";

  // Preset code contents matching user's edited keywords
  const PRESETS = {
    "main.cupcakke": ``, // Will load from originalShowcase or fetch
    "basic": `// 🍒 Variable Pleasures
bitch pleasure = 60;
cumshot climax_offset = 9;
bitch excitement = pleasure + climax_offset;

squirt("1. Variables & Expressions:");
squirt("Base pleasure:", pleasure);
squirt("Climax offset:", climax_offset);
squirt("Excitement level reaches:", excitement); // Prints 69!`,

    "conditional": `// 🍓 Smack Conditionals
bitch wetness_level = 80;

squirt("2. smack Conditionals:");
slurp (wetness_level > 70) {
  squirt("💦 Get the mop and the bucket! It is soaking!");
} smack {
  squirt("🧴 Apply some lubrication immediately.");
}`,

    "loop": `// 🔥 Looping (deepthroat while loop)
squirt("3. Looping (deepthroat):");
bitch countdown = 3;

deepthroat (countdown > 0) {
  squirt("🔥 Squeezing in...", countdown);
  countdown = countdown - 1;
}

squirt("💥 SPLASH! Give it to me now!");`,

    "function": `// 👅 deepthroat Functions & Recursion (using fuck & give_it_to_me_now)
squirt("4. fuck Functions & Recursion:");

fuck compute_climax(n) {
  slurp (n <= 1) {
    give_it_to_me_now 1;
  } smack {
    give_it_to_me_now n * compute_climax(n - 1);
  }
}

bitch factorial_result = compute_climax(5);
squirt("Recursion climax (5!):", factorial_result); // Prints 120`,

    "cpr": `// 🚑 CPR Exception Safety
squirt("5. CPR try-catch recovery:");

cpr {
  squirt("Trying to divide by zero...");
  bitch dangerous = 10 / 0; // Trigger runtime error
  squirt("This will never print:", dangerous);
} cream (moan_val) {
  squirt("🚑 CPR Successful! Recovered from moan:", moan_val);
}`,

    "oop": `// 🍑 OOP Class Pleasures
squirt("6. Object-Oriented papi Classes & Methods:");

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
favorite.moan(); // Prints: 💦 Moan from Pink Bullet - Excitement level is: 69`
  };

  // Virtual File System (VFS)
  let vfs = {};
  let currentFile = "main.cupcakke";

  const saveVFS = () => {
    localStorage.setItem("cupcakke_vfs", JSON.stringify(vfs));
  };

  const loadVFS = () => {
    const saved = localStorage.getItem("cupcakke_vfs");
    if (saved) {
      try {
        vfs = JSON.parse(saved);
      } catch (e) {
        vfs = {};
      }
    }
    // Ensure critical defaults exist
    if (!vfs["main.cupcakke"]) {
      vfs["main.cupcakke"] = originalShowcase || getFallbackShowcase();
    }
    if (!vfs["interpreter.js"]) {
      vfs["interpreter.js"] = "// Loading interpreter.js core...";
      fetch("interpreter.js")
        .then((res) => res.text())
        .then((text) => {
          vfs["interpreter.js"] = text;
          if (currentFile === "interpreter.js") {
            codeEditor.value = text;
            updateLineNumbers();
          }
        })
        .catch(() => {});
    }
  };

  const renderFileTree = () => {
    const treeChildren = document.querySelector(".tree-children");
    if (!treeChildren) return;
    treeChildren.innerHTML = "";

    Object.keys(vfs).sort().forEach((filename) => {
      const fileItem = document.createElement("div");
      fileItem.className = `tree-item file ${filename === currentFile ? "active" : ""}`;
      fileItem.dataset.file = filename;

      const fileSpan = document.createElement("span");
      fileSpan.className = "file-name";

      const fileIcon = document.createElement("i");
      if (filename.endsWith(".cupcakke")) {
        fileIcon.className = "fa-regular fa-file-code text-pink";
      } else if (filename.endsWith(".js")) {
        fileIcon.className = "fa-brands fa-js text-yellow";
      } else {
        fileIcon.className = "fa-regular fa-file text-muted";
      }

      fileSpan.appendChild(fileIcon);
      fileSpan.appendChild(document.createTextNode(` ${filename}`));
      fileItem.appendChild(fileSpan);

      fileItem.addEventListener("click", () => {
        selectFile(filename);
      });

      treeChildren.appendChild(fileItem);
    });
  };

  const selectFile = (filename) => {
    // Save current active state before switching
    if (vfs[currentFile] !== undefined && !codeEditor.hasAttribute("readonly")) {
      vfs[currentFile] = codeEditor.value;
      saveVFS();
    }

    currentFile = filename;
    codeEditor.value = vfs[filename] || "";
    activeFilename.textContent = filename;

    if (filename === "interpreter.js") {
      codeEditor.setAttribute("readonly", "true");
    } else {
      codeEditor.removeAttribute("readonly");
    }

    renderFileTree();
    updateLineNumbers();
    playGulpSound();
  };

  // Fetch or set default file content
  const init = async () => {
    // Dynamically fetch mapping_table.json inside browser to synchronize the compiler keywords
    try {
      const mapRes = await fetch("mapping_table.json");
      if (mapRes.ok) {
        const customMappings = await mapRes.json();
        Object.assign(CupcakKe.MAPPINGS, customMappings);
        CupcakKe.updateKeywords(); // Regenerate KEYWORDS token mapping in browser!
      }
    } catch (e) {
      // Graceful fallback
    }

    try {
      const res = await fetch("main.cupcakke");
      if (res.ok) {
        originalShowcase = await res.text();
      } else {
        originalShowcase = getFallbackShowcase();
      }
    } catch (e) {
      originalShowcase = getFallbackShowcase();
    }
    
    PRESETS["main.cupcakke"] = originalShowcase;
    
    // Load VFS and set active file editor
    loadVFS();
    codeEditor.value = vfs[currentFile] || originalShowcase;
    renderFileTree();
    updateLineNumbers();
  };

  // Fallback program if fetch fails
  const getFallbackShowcase = () => {
    return `// ==========================================
// 💋 WELCOME TO THE CUPCAKKE IDE SHOWCASE 💋
// File: main.cupcakke
// ==========================================

squirt("✨ Initializing Pure Sensual CupcakKeScript Demonstration... ✨");
squirt("--------------------------------------------");

// 1. Variable Declarations using dynamic keywords!
bitch base_pleasure = 60;
cumshot climax_offset = 9; // Constants
bitch excitement = base_pleasure + climax_offset;
swallow description = "Ultimate climax";

squirt("1. Variables & Expressions:");
squirt("Excitement level reaches:", excitement); // Prints 69!
squirt("Description:", description);
squirt();

// 2. Conditionals with Else-If Chains (slurp, smack slurp, smack)
squirt("2. Conditionals (Else-If Chain):");
slurp (excitement > 100) {
  squirt("💦 Extreme over-excitement! Too tight!");
} smack slurp (excitement >= 69) {
  squirt("💦 Oh yes! Excitement is fully charged at 69!");
} smack {
  squirt("👄 A bit dry, we need more excitement!");
}
squirt();

// 3. Array Operations (chopsticks)
squirt("3. Array indexing with chopsticks:");
lick toys = ["Lube", "Handcuffs", "Vanilla Pudding", "Chopsticks"];
lick favorite_toy = toys chopsticks 2; // Access index 2
squirt("Our favorite item in the bag is:", favorite_toy);
squirt();

// 4. Loops (deepthroat)
squirt("4. Looping (deepthroat):");
bitch countdown = 3;
deepthroat (countdown > 0) {
  squirt("🔥 Squeezing in...", countdown);
  countdown = countdown - 1;
}
squirt("💥 SPLASH! Give it to me now!");
squirt();

// Define a Class named "Toy" (using papi keyword)
squirt("5. Object-Oriented papi Classes & Methods:");
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
favorite.moan(); // Prints: 💦 Moan from Pink Bullet - Excitement level is: 69
squirt();

// 6. Error Handling (cpr)
squirt("6. Emergency CPR try-catch recovery:");
cpr {
  squirt("Trying to divide by zero...");
  bitch dangerous = 10 / 0; // Trigger runtime error
  squirt("This will never print:", dangerous);
} cream (moan_val) {
  squirt("🚑 CPR Successful! Recovered from moan:", moan_val);
}

squirt("--------------------------------------------");
squirt("💋 CupcakKeScript Pure Experience runs flawlessly! Slurp! 💋");`;
  };

  // --- AUDIO SYNTHESIS VIA WEB AUDIO API ---
  const initAudio = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  };

  const playSound = (freqs, durations, type = "sine", sweep = false) => {
    if (!audioEnabled) return;
    initAudio();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    let time = audioCtx.currentTime;
    freqs.forEach((freq, index) => {
      const duration = durations[index] || 0.1;
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc.type = type;
      if (sweep && index > 0) {
        osc.frequency.setValueAtTime(freqs[index - 1], time);
        osc.frequency.exponentialRampToValueAtTime(freq, time + duration);
      } else {
        osc.frequency.setValueAtTime(freq, time);
      }

      // Envelopes
      gainNode.gain.setValueAtTime(0.15, time);
      gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.start(time);
      osc.stop(time + duration);

      time += duration * 0.8;
    });
  };

  // Iconic sounds synthesizers
  const playGulpSound = () => {
    playSound([200, 600], [0.15], "sine", true);
  };

  const playMoanSound = () => {
    playSound([500, 150], [0.55], "triangle", true);
  };

  const playClimaxSound = () => {
    playSound([261.63, 329.63, 392.00, 523.25, 659.25], [0.1, 0.1, 0.1, 0.1, 0.25], "sine");
  };

  // --- LINE NUMBERS HANDLERS ---
  const updateLineNumbers = () => {
    const lines = codeEditor.value.split("\n");
    const count = lines.length;
    let numStr = "";
    for (let i = 1; i <= count; i++) {
      numStr += i + "<br>";
    }
    lineNumbers.innerHTML = numStr;
  };

  codeEditor.addEventListener("input", () => {
    updateLineNumbers();
    if (vfs[currentFile] !== undefined && !codeEditor.hasAttribute("readonly")) {
      vfs[currentFile] = codeEditor.value;
      saveVFS();
    }
  });

  codeEditor.addEventListener("scroll", () => {
    lineNumbers.scrollTop = codeEditor.scrollTop;
  });

  // --- PRESETS LOADER ---
  exampleSelect.addEventListener("change", (e) => {
    const selected = e.target.value;
    if (selected in PRESETS) {
      if (currentFile !== "interpreter.js") {
        codeEditor.value = PRESETS[selected];
        vfs[currentFile] = PRESETS[selected];
        saveVFS();
        updateLineNumbers();
        appendConsoleLog(`[System] Loaded preset into active file: ${selected}`);
      } else {
        selectFile("main.cupcakke");
        codeEditor.value = PRESETS[selected];
        vfs["main.cupcakke"] = PRESETS[selected];
        saveVFS();
        updateLineNumbers();
        appendConsoleLog(`[System] Switched to main.cupcakke and loaded preset: ${selected}`);
      }
      playGulpSound();
    }
  });

  // File Explorer Actions
  newFileBtn.addEventListener("click", () => {
    const filename = prompt("👄 Enter new filename (e.g. climax.cupcakke):");
    if (!filename) return;

    const trimmed = filename.trim();
    if (!trimmed) {
      alert("Filename cannot be empty!");
      return;
    }
    if (vfs[trimmed] !== undefined) {
      alert("File already exists!");
      return;
    }
    if (!trimmed.endsWith(".cupcakke") && !trimmed.endsWith(".js") && !trimmed.endsWith(".json")) {
      alert("File extension must be .cupcakke, .js, or .json!");
      return;
    }

    vfs[trimmed] = `// File: ${trimmed}\n\nsquirt("Initializing ${trimmed}...");\n`;
    saveVFS();
    renderFileTree();
    selectFile(trimmed);
    appendConsoleLog(`[System] Created file: ${trimmed}`);
  });

  deleteFileBtn.addEventListener("click", () => {
    if (currentFile === "main.cupcakke" || currentFile === "interpreter.js") {
      alert("🚨 Cannot delete system critical files!");
      return;
    }
    if (confirm(`👄 Are you sure you want to swallow & delete "${currentFile}" permanently?`)) {
      const deletedName = currentFile;
      delete vfs[currentFile];
      saveVFS();
      selectFile("main.cupcakke");
      appendConsoleLog(`[System] Deleted file: ${deletedName}`);
    }
  });

  // Audio Toggle Action
  audioToggleBtn.addEventListener("click", () => {
    audioEnabled = !audioEnabled;
    if (audioEnabled) {
      audioToggleBtn.classList.add("active");
      audioToggleBtn.querySelector("i").className = "fa-solid fa-volume-high";
      audioToggleBtn.querySelector("span").textContent = "Audio: ON";
      initAudio();
      playGulpSound();
    } else {
      audioToggleBtn.classList.remove("active");
      audioToggleBtn.querySelector("i").className = "fa-solid fa-volume-xmark";
      audioToggleBtn.querySelector("span").textContent = "Audio: OFF";
    }
  });

  // --- CONSOLE OUTPUT HELPERS ---
  const appendConsoleLog = (text) => {
    const line = document.createElement("div");
    line.className = "console-line";
    line.textContent = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  const appendConsoleSuccess = (text) => {
    const line = document.createElement("div");
    line.className = "console-line success-line";
    line.textContent = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  const appendConsoleError = (text) => {
    const line = document.createElement("div");
    line.className = "console-line error-line";
    line.textContent = text;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  clearConsoleBtn.addEventListener("click", () => {
    consoleOutput.innerHTML = `<div class="console-line system-line">[System] Console cleared.</div>`;
    playGulpSound();
  });

  clearEditorBtn.addEventListener("click", () => {
    codeEditor.value = "";
    updateLineNumbers();
    if (vfs[currentFile] !== undefined && !codeEditor.hasAttribute("readonly")) {
      vfs[currentFile] = "";
      saveVFS();
    }
    playGulpSound();
  });

  resetEditorBtn.addEventListener("click", () => {
    if (confirm("👄 Reset all custom workspace files and VFS to defaults?")) {
      localStorage.removeItem("cupcakke_vfs");
      currentFile = "main.cupcakke";
      codeEditor.removeAttribute("readonly");
      loadVFS();
      codeEditor.value = vfs["main.cupcakke"];
      renderFileTree();
      activeFilename.textContent = "main.cupcakke";
      exampleSelect.value = "main.cupcakke";
      updateLineNumbers();
      appendConsoleLog("[System] Reset workspace and virtual filesystem to defaults.");
      playClimaxSound();
    }
  });

  // --- GULP INPUT STREAM OVERLAY MODAL ---
  const showGulpModal = (promptMsg) => {
    return new Promise((resolve) => {
      const modal = document.getElementById("gulp-modal");
      const modalText = document.getElementById("gulp-prompt-text");
      const input = document.getElementById("gulp-input");
      const submitBtn = document.getElementById("gulp-submit-btn");
      const cancelBtn = document.getElementById("gulp-cancel-btn");

      modalText.textContent = promptMsg;
      input.value = "";
      modal.classList.add("active");
      input.focus();
      playGulpSound();

      const handleResolve = () => {
        modal.classList.remove("active");
        cleanup();
        resolve(input.value);
      };

      const handleReject = () => {
        modal.classList.remove("active");
        cleanup();
        resolve("");
      };

      const handleKey = (e) => {
        if (e.key === "Enter") {
          handleResolve();
        }
      };

      const cleanup = () => {
        submitBtn.removeEventListener("click", handleResolve);
        cancelBtn.removeEventListener("click", handleReject);
        input.removeEventListener("keydown", handleKey);
      };

      submitBtn.addEventListener("click", handleResolve);
      cancelBtn.addEventListener("click", handleReject);
      input.addEventListener("keydown", handleKey);
    });
  };

  // --- CORE INTERPRETER INVOCATION ---
  runBtn.addEventListener("click", async () => {
    const code = codeEditor.value;
    if (!code.trim()) {
      appendConsoleError("Cannot swallow an empty script! Please write some CupcakKeScript.");
      playMoanSound();
      return;
    }

    appendConsoleLog("------------------------------------");
    appendConsoleLog(`[VM] Gulping & parsing active script...`);
    
    // Create Lexer
    const lexer = new CupcakKe.Lexer(code);
    
    // Create Parser
    const parser = new CupcakKe.Parser(lexer);
    const program = parser.parseProgram();

    // Check Parse Errors
    if (parser.errors.length > 0) {
      appendConsoleError(`👄 Parsing Climax Interrupted! Found ${parser.errors.length} Syntax Error(s):`);
      parser.errors.forEach((err) => {
        appendConsoleError(`   --> ${err}`);
      });
      astOutput.innerHTML = `<pre class="json-code" style="color: #ff3366;">/* Parse Failure */\n${parser.errors.join('\n')}</pre>`;
      playMoanSound();
      return;
    }

    // AST Visualizer rendering
    try {
      const cleanAST = JSON.stringify(program.statements, (key, value) => {
        if (key === "token") return undefined;
        return value;
      }, 2);
      astOutput.innerHTML = `<pre class="json-code">${escapeHtml(cleanAST)}</pre>`;
    } catch (e) {
      astOutput.innerHTML = `<pre class="json-code">/* AST Rendering Error */</pre>`;
    }

    // Set up standard input-output callbacks
    const evaluator = new CupcakKe.Evaluator({
      stdout: (msg) => {
        appendConsoleLog(`💦 [Stdout] ${msg}`);
      },
      stdin: (promptMsg) => {
        playGulpSound();
        const userInput = prompt(`👅 GULP STREAM REQUESTED INPUT:\n\n${promptMsg}`);
        return userInput;
      }
    });

    try {
      const result = evaluator.evaluate(program, evaluator.globals);
      
      if (result.type === "ERROR") {
        appendConsoleError(result.inspect());
        playMoanSound();
      } else {
        appendConsoleSuccess(`🎉 Script executed successfully! Climax achieved!`);
        playClimaxSound();
      }
    } catch (e) {
      appendConsoleError(`💀 VM Crash: ${e.message}`);
      playMoanSound();
    }
  });

  const escapeHtml = (text) => {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Run initialization
  init();
});
