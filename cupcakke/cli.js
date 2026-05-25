#!/usr/bin/env node
/**
 * CupcakKeScript CLI Runner
 * Usage: node cli.js <filename.cupcakke>
 */

const fs = require("fs");
const path = require("path");
const CupcakKe = require("./interpreter.js");

// Read arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("👄 CupcakKeScript CLI - v1.0.0");
  console.log("Usage: node cli.js <filename.cupcakke>");
  process.exit(0);
}

const filepath = path.resolve(args[0]);
if (!fs.existsSync(filepath)) {
  console.error(`💀 File not found: ${args[0]}`);
  process.exit(1);
}

const code = fs.readFileSync(filepath, "utf8");

// Setup Lexer & Parser
const lexer = new CupcakKe.Lexer(code);
const parser = new CupcakKe.Parser(lexer);
const program = parser.parseProgram();

if (parser.errors.length > 0) {
  console.error(`👄 Parsing Failed! ${parser.errors.length} Syntax Error(s) found:`);
  parser.errors.forEach((err) => console.error(`   --> ${err}`));
  process.exit(1);
}

// Setup Environment & Evaluator
const evaluator = new CupcakKe.Evaluator({
  stdout: (msg) => console.log(msg),
  stdin: (promptMsg) => {
    // Synchronous terminal input
    const readline = require("readline-sync");
    return readline.question(`👅 ${promptMsg} `);
  }
});

// Run Program
(async () => {
  try {
    const result = await evaluator.evaluate(program, evaluator.globals);
    if (result.type === "ERROR") {
      console.error(result.inspect());
      process.exit(1);
    }
  } catch (e) {
    console.error(`💀 VM Crash: ${e.message}`);
    process.exit(1);
  }
})();
