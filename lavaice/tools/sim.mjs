#!/usr/bin/env node
/**
 * Headless survival benchmark for the LAVICE bots.
 *
 * Runs the real game script — extracted straight out of the HTML page — in
 * Node with a seeded RNG, drives it with a bot at full speed, and reports how
 * long each run survives. No dependencies.
 *
 *   node tools/sim.mjs                          16 seeds x 10 min, Superbot
 *   node tools/sim.mjs --minutes 20 --seeds 1-32
 *   node tools/sim.mjs --doctrine hunter --size 900x600
 *   node tools/sim.mjs --bot classic            the original bot.js, for comparison
 *   node tools/sim.mjs --engine classic         Superbot on index.html's own engine
 *   node tools/sim.mjs --engine lite            lite.html's copy of the rules
 *   node tools/sim.mjs --mine off               no landmine (also: --mine score)
 *   node tools/sim.mjs --tune classic           classic spawn curve, fixed mine (or a JSON patch for TUNE)
 *   node tools/sim.mjs --parity                 prove super.html's engine == index.html's
 *   node tools/sim.mjs --seeds 7 --trace        last second + local map of one run
 *
 * One game "minute" is 3600 simulation frames (the game logic's 60 Hz).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINES = {
    super: { file: 'super.html', scriptId: 'lavice-core' },
    lite: { file: 'lite.html', scriptId: 'lavice-core' },
    classic: { file: 'index.html', scriptId: null }
};

// ----------------------------------------------------------------- sandbox

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A do-nothing stand-in for any DOM object: every property and call returns itself. */
function makeStub() {
    const store = new Map();
    const proxy = new Proxy(function () {}, {
        get(_t, k) {
            if (k === Symbol.toPrimitive) return () => 0;
            if (k === 'then') return undefined;
            return store.has(k) ? store.get(k) : proxy;
        },
        set(_t, k, v) { store.set(k, v); return true; },
        apply() { return proxy; },
        construct() { return proxy; }
    });
    return proxy;
}

function extractScript(html, id) {
    const re = id
        ? new RegExp(`<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/script>`)
        : /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/;
    const m = html.match(re);
    if (!m) throw new Error(id ? `script#${id} not found` : 'no inline script found');
    return m[1];
}

// Appended after the engine + bot so it shares their scope.
const DRIVER = `
    var __s = { hits: 0, hitHp: 0, burnHp: 0, minHp: 100, minHp5: 100, maxEnemies: 0, botMs: 0, botMsMax: 0, at5: null, cause: '' };
    var __trace = null, __traceLen = 0;
    __s.mines = 0; __s.mineBlasts = 0; __s.mineKills = 0; __s.minesBuried = 0; __s.minesReplaced = 0;
    if (typeof fx === 'function') {
        var __fx0 = fx;
        fx = function (kind, x, y, a, b) {
            if (kind === 'mine_set') __s.mines++;
            else if (kind === 'mine_blast') { __s.mineBlasts++; __s.mineKills += a; }
            else if (kind === 'mine_lost') { if (a === 'buried') __s.minesBuried++; else __s.minesReplaced++; }
            __fx0(kind, x, y, a, b);
        };
    }
    function __snap() {
        return {
            f: frame, x: +player.x.toFixed(1), y: +player.y.toFixed(1), hp: +player.hp.toFixed(1),
            dash: player.isDashing ? player.dashDuration : 0, cd: player.dashCooldown,
            move: (keys.KeyW ? 'W' : '') + (keys.KeyA ? 'A' : '') + (keys.KeyS ? 'S' : '') + (keys.KeyD ? 'D' : ''),
            fire: (keys.ArrowUp ? 'U' : '') + (keys.ArrowLeft ? 'L' : '') + (keys.ArrowDown ? 'D' : '') + (keys.ArrowRight ? 'R' : ''),
            inWall: isWall(player.x, player.y) ? 1 : 0, enemies: enemies.length,
            bot: (__bot && __bot.debugLine) ? __bot.debugLine() : ''
        };
    }
    function __run(maxFrames) {
        let n = 0, lastHp = player.hp;
        const recent = new Float32Array(600), kind = new Uint8Array(600);
        while (n < maxFrames && !isGameOver) {
            const t0 = performance.now();
            __tick();
            const dt = performance.now() - t0;
            __s.botMs += dt;
            if (dt > __s.botMsMax && n > 120) __s.botMsMax = dt;
            if (__trace) { __trace[__traceLen % __trace.length] = __snap(); __traceLen++; }
            update();
            frame++;
            n++;
            const hp = player.hp, slot = n % 600;
            const lost = lastHp - hp + (lastHp < player.maxHp ? 0.05 : 0);
            recent[slot] = 0; kind[slot] = 0;
            if (hp < lastHp - 5) { const k = Math.round((lastHp - hp) / 10); __s.hits += k; __s.hitHp += k * 10; recent[slot] = k * 10; kind[slot] = 1; }
            else if (hp < lastHp - 0.01) { __s.burnHp += lost; recent[slot] = lost; kind[slot] = 2; }
            if (hp < __s.minHp) __s.minHp = hp;
            if (n <= 18000 && hp < __s.minHp5) __s.minHp5 = hp;
            if (n === 18000) __s.at5 = { score: score, wave: wave, alive: enemies.length };
            if (enemies.length > __s.maxEnemies) __s.maxEnemies = enemies.length;
            lastHp = hp;
            if (isGameOver) {
                let h = 0, b = 0;
                for (let i = 0; i < 600; i++) { if (kind[i] === 1) h += recent[i]; else if (kind[i] === 2) b += recent[i]; }
                __s.cause = (player.x < 0 || player.x > width || player.y < 0 || player.y > height) ? 'out of bounds'
                    : (b > h * 1.5 ? 'burn' : (h > b * 1.5 ? 'contact' : 'mixed'));
            }
        }
        return n;
    }
    function __map(cols, rows, cell) {
        const out = [];
        for (let r = 0; r < rows; r++) {
            let line = '';
            for (let c = 0; c < cols; c++) {
                const x = player.x + (c - cols / 2 + 0.5) * cell, y = player.y + (r - rows / 2 + 0.5) * cell;
                let ch = (x < 0 || x > width || y < 0 || y > height) ? ' ' : (isWall(x, y) ? '#' : '.');
                for (const e of enemies) if (Math.abs(e.x - x) <= cell / 2 && Math.abs(e.y - y) <= cell / 2) { ch = e.type === 'ice_dust' ? 'i' : 'L'; break; }
                if (Math.abs(player.x - x) <= cell / 2 && Math.abs(player.y - y) <= cell / 2) ch = '@';
                line += ch;
            }
            out.push(line);
        }
        return out.join('\\n');
    }
    function __digest() {
        let h = 0;
        for (const e of enemies) h = (h * 31 + Math.round(e.x * 1000) * 7 + Math.round(e.y * 1000) * 13 + e.hp) | 0;
        for (const b of bullets) h = (h * 31 + Math.round(b.x * 1000) + Math.round(b.y * 1000) * 3 + b.life) | 0;
        return [frame, score, wave, enemies.length, bullets.length, Math.round(player.x * 1e6), Math.round(player.y * 1e6), Math.round(player.hp * 1e6), player.dashCooldown, isGameOver ? 1 : 0, h].join('|');
    }
    return {
        run: __run,
        stats: function () { return __s; },
        state: function () { return { frame: frame, score: score, wave: wave, hp: player.hp, dead: isGameOver, enemies: enemies.length }; },
        trace: function (n) { __trace = new Array(n); },
        tail: function () { const o = []; for (let i = Math.max(0, __traceLen - __trace.length); i < __traceLen; i++) o.push(__trace[i % __trace.length]); return o; },
        map: __map,
        digest: __digest,
        prime: function () { update(); frame++; if (typeof __afterPrime === 'function') __afterPrime(); }
    };
`;

/**
 * Build one game. The page's script, the bot and the driver are compiled into a
 * single function scope, so the page's top-level `let`s become ordinary closure
 * variables (fast, and private to this game instance).
 */
export function createGame({ engine = 'super', bot = 'super', seed = 1, width = 1280, height = 720, botOptions = null, botFile = null, shim = '', mine = '', tune = '' }) {
    const spec = ENGINES[engine];
    const elements = new Map();
    const document = {
        getElementById(id) { if (!elements.has(id)) elements.set(id, makeStub()); return elements.get(id); },
        createElement: makeStub, querySelector: makeStub, querySelectorAll: () => [],
        addEventListener() {}, body: makeStub(), documentElement: makeStub()
    };
    const window = {
        innerWidth: width, innerHeight: height, devicePixelRatio: 1, document,
        addEventListener() {}, removeEventListener() {},
        M4_DISABLE_AUTO_BOOT: true      // stop bot.js from booting itself on a timer
    };
    const SeededMath = {};
    for (const k of Object.getOwnPropertyNames(Math)) SeededMath[k] = Math[k];
    SeededMath.random = mulberry32(seed);

    const parts = [extractScript(fs.readFileSync(path.join(ROOT, spec.file), 'utf8'), spec.scriptId), shim];
    if (engine !== 'classic' && mine === 'off') parts.push('MINE.enabled = false;');
    if (engine !== 'classic' && mine === 'score') parts.push('MINE.scores = true;');
    if (engine !== 'classic' && tune) parts.push(`if (typeof TUNE !== 'undefined') { Object.assign(TUNE, ${tune === 'classic' ? '{ spawnKnee: Infinity, mineHaste: 0, mineReach: 0, iceStep: 0 }' : tune}); tuneMine(); }`);
    if (bot === 'classic') {
        parts.push(fs.readFileSync(path.join(ROOT, 'bot.js'), 'utf8'));
        parts.push('var __bot = new M4NeuralBot(); __bot.enabled = true; function __tick() { __bot.update(); }');
    } else if (bot === 'super') {
        parts.push(fs.readFileSync(botFile || path.join(ROOT, 'super-bot.js'), 'utf8'));
        parts.push('var __bot = new SuperBot(__botOptions || undefined); function __tick() { __bot.think(); }');
    } else {
        parts.push('var __bot = null; function __tick() {}');
    }
    parts.push(DRIVER);

    const quiet = { log() {}, warn() {}, info() {}, error: console.error };
    const factory = new Function('window', 'document', 'requestAnimationFrame', 'setTimeout', 'performance', 'console', 'Math', '__botOptions', parts.join('\n;\n'));
    return factory(window, document, () => 0, () => 0, performance, quiet, SeededMath, botOptions);
}

// ------------------------------------------------------------------- cli

function parseArgs(argv) {
    const a = {};
    for (let i = 2; i < argv.length; i++) {
        if (!argv[i].startsWith('--')) continue;
        const next = argv[i + 1];
        a[argv[i].slice(2)] = next !== undefined && !next.startsWith('--') ? argv[++i] : true;
    }
    return a;
}

function parseSeeds(spec) {
    const out = [];
    for (const part of String(spec).split(',')) {
        const [lo, hi] = part.split('-').map(Number);
        for (let s = lo; s <= (hi === undefined ? lo : hi); s++) out.push(s);
    }
    return out;
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function runOne(cfg, seed) {
    const g = createGame({ ...cfg, seed });
    if (cfg.trace) g.trace(60);
    const n = g.run(cfg.frames);
    const st = g.state(), s = g.stats();
    const row = {
        seed, frames: n, sec: +(n / 60).toFixed(1), dead: st.dead, score: st.score, wave: st.wave, hp: +st.hp.toFixed(1),
        enemies: st.enemies, maxEnemies: s.maxEnemies, hits: s.hits, hitHp: s.hitHp, burnHp: Math.round(s.burnHp),
        mines: s.mines, mineBlasts: s.mineBlasts, mineKills: s.mineKills, minesBuried: s.minesBuried, minesReplaced: s.minesReplaced,
        minHp5: +s.minHp5.toFixed(1), at5: s.at5, cause: s.cause, botMs: +(s.botMs / Math.max(1, n)).toFixed(3), botMsMax: +s.botMsMax.toFixed(1)
    };
    if (cfg.trace) row.trace = { tail: g.tail(), map: g.map(96, 40, 8) };
    return row;
}

function summarize(rows, cfg) {
    const N = rows.length;
    const secs = rows.map(r => r.sec).sort((a, b) => a - b);
    const q = (p) => secs[Math.min(N - 1, Math.floor(p * N))];
    const mean = (f) => rows.reduce((s, r) => s + f(r), 0) / N;
    const cap = cfg.frames / 60;
    console.log(`\n${cfg.bot} bot · ${cfg.engine} engine · ${cfg.width}x${cfg.height} · ${N} runs capped at ${clock(cap)}` + (cfg.bot === 'super' ? ` · ${(cfg.botOptions && cfg.botOptions.doctrine) || 'endurance'} doctrine` : ''));
    console.log(`  survival   worst ${clock(secs[0])}   p10 ${clock(q(0.1))}   median ${clock(q(0.5))}   best ${clock(secs[N - 1])}`);
    const marks = [180, 300, 600, 900, 1200].filter(t => t <= cap);
    if (marks.length) console.log('  reached    ' + marks.map(t => `${clock(t)} → ${rows.filter(r => r.sec >= t).length}/${N}`).join('   '));
    const m5 = rows.map(r => r.minHp5).sort((a, b) => a - b);
    const a5 = rows.filter(r => r.at5);
    console.log(`  first 5:00 lowest HP worst ${m5[0]} · median ${m5[Math.floor(N / 2)]}` +
        (a5.length ? `   at 5:00 → score ${Math.round(a5.reduce((s, r) => s + r.at5.score, 0) / a5.length)}, wave ${(a5.reduce((s, r) => s + r.at5.wave, 0) / a5.length).toFixed(1)}, ${Math.round(a5.reduce((s, r) => s + r.at5.alive, 0) / a5.length)} hostiles alive` : ''));
    console.log(`  whole run  score ${Math.round(mean(r => r.score))} · wave ${mean(r => r.wave).toFixed(1)} · peak hostiles ${Math.round(mean(r => r.maxEnemies))} · contact hits ${mean(r => r.hits).toFixed(1)} · burn ${Math.round(mean(r => r.burnHp))} HP · bot ${mean(r => r.botMs).toFixed(2)} ms/frame`);
    if (rows.some(r => r.mines)) {
        const sum = (f) => rows.reduce((t, r) => t + f(r), 0);
        const laid = sum(r => r.mines), blasts = sum(r => r.mineBlasts);
        console.log(`  landmines  ${(laid / N).toFixed(1)} laid per run · ${blasts} of ${laid} went off, ${(sum(r => r.mineKills) / Math.max(1, blasts)).toFixed(1)} kills each · ${sum(r => r.minesBuried)} buried · ${sum(r => r.minesReplaced)} replaced unused`);
    }
    const dead = rows.filter(r => r.dead);
    if (dead.length) console.log(`  deaths     ${dead.length}/${N}: ` + dead.map(r => `seed ${r.seed} at ${clock(r.sec)} (${r.cause})`).join(', '));
}

function parity(cfg) {
    // The classic build spends Math.random() on particles and screen shake.
    // Make the new engine's fx() hook burn exactly the same calls, then both
    // engines must stay bit-identical under the same seed and the same bot.
    const shim = `
        fx = function (kind) {
            if (kind === 'dash') { for (let i = 0; i < 24; i++) Math.random(); }
            else if (kind === 'burn') { if (Math.random() < 0.3) { Math.random(); Math.random(); } }
            else if (kind === 'kill') { for (let i = 0; i < 16; i++) Math.random(); }
        };
        MINE.enabled = false;       // the classic build has no landmine
        TUNE.spawnKnee = Infinity;  // ...and its spawn curve never eases off
        TUNE.iceStep = 0;           // ...and its ice dust always dies to one hit
        var __afterPrime = function () { Math.random(); Math.random(); };`;
    const sizes = [[1280, 720], [900, 600], [1512, 860]];
    let ok = true, total = 0;
    for (const seed of cfg.seeds) {
        const [width, height] = sizes[seed % sizes.length];
        const botOptions = { doctrine: seed % 2 ? 'hunter' : 'endurance' };
        const a = createGame({ engine: 'classic', bot: 'super', seed, width, height, botOptions });
        const b = createGame({ engine: 'super', bot: 'super', seed, width, height, botOptions, shim });
        b.prime();      // index.html runs one update + draw at load
        let frames = 0, at = -1;
        while (frames < cfg.frames && !a.state().dead) {
            a.run(20); b.run(20); frames += 20;
            if (a.digest() !== b.digest()) { at = frames; break; }
        }
        total += frames;
        const st = a.state();
        console.log(`  seed ${seed} · ${width}x${height} · ${botOptions.doctrine}: ${at < 0 ? 'identical' : 'DIVERGED by frame ' + at} over ${frames} frames (score ${st.score}, wave ${st.wave}, ${st.dead ? 'died' : 'alive'})`);
        if (at >= 0) ok = false;
    }
    console.log(ok ? `\nparity OK — ${total} frames compared, every one identical` : '\nparity FAILED');
    process.exitCode = ok ? 0 : 1;
}

async function main() {
    const args = parseArgs(process.argv);
    const [width, height] = String(args.size || '1280x720').split('x').map(Number);
    const cfg = {
        engine: args.engine || (args.bot === 'classic' ? 'classic' : 'super'),
        bot: args.bot || 'super',
        width, height,
        frames: Math.round(Number(args.minutes || 10) * 3600),
        botOptions: args.doctrine ? { doctrine: args.doctrine } : (args.opts ? JSON.parse(args.opts) : null),
        botFile: args.botfile || null,
        trace: !!args.trace,
        mine: args.mine || '',
        tune: args.tune || '',
        seeds: parseSeeds(args.seeds || (args.parity ? '1-6' : '1-16'))
    };

    if (args.worker) {                       // child process: one seed, one JSON line
        process.stdout.write(JSON.stringify(runOne(cfg, cfg.seeds[0])) + '\n');
        return;
    }
    if (args.parity) { if (!args.minutes) cfg.frames = 30000; parity(cfg); return; }

    // Snapshot the bot so edits made while a long benchmark runs cannot leak in.
    let snapshot = null;
    if (cfg.bot === 'super') {
        snapshot = path.join(os.tmpdir(), `lavice-super-bot-${process.pid}.js`);
        fs.copyFileSync(cfg.botFile || path.join(ROOT, 'super-bot.js'), snapshot);
    }
    const jobs = Math.max(1, Number(args.jobs || Math.min(cfg.seeds.length, Math.max(1, os.cpus().length - 2))));
    const pass = ['--worker', '--engine', cfg.engine, '--bot', cfg.bot, '--size', `${width}x${height}`, '--minutes', String(cfg.frames / 3600)];
    if (cfg.botOptions) pass.push('--opts', JSON.stringify(cfg.botOptions));
    if (snapshot) pass.push('--botfile', snapshot);
    if (cfg.trace) pass.push('--trace');
    if (cfg.mine) pass.push('--mine', cfg.mine);
    if (cfg.tune) pass.push('--tune', cfg.tune);

    const rows = [];
    let next = 0;
    await new Promise((resolve) => {
        let running = 0;
        const launch = () => {
            while (running < jobs && next < cfg.seeds.length) {
                const seed = cfg.seeds[next++];
                running++;
                const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...pass, '--seeds', String(seed)], { stdio: ['ignore', 'pipe', 'inherit'] });
                let out = '';
                child.stdout.on('data', (d) => { out += d; });
                child.on('close', () => {
                    try {
                        const row = JSON.parse(out.trim().split('\n').pop());
                        rows.push(row);
                        console.log(`  seed ${String(row.seed).padStart(3)}  ${row.dead ? 'died at ' + clock(row.sec) : 'alive at ' + clock(row.sec)}  score ${String(row.score).padStart(6)}  wave ${String(row.wave).padStart(3)}  hostiles ${String(row.enemies).padStart(3)}  hits ${String(row.hits).padStart(3)}`);
                    } catch (e) { console.error(`  seed ${seed}: run failed`); }
                    running--;
                    if (next >= cfg.seeds.length && running === 0) resolve(); else launch();
                });
            }
        };
        launch();
    });
    if (snapshot) fs.unlinkSync(snapshot);

    rows.sort((a, b) => a.seed - b.seed);
    if (cfg.trace) {
        for (const r of rows) {
            console.log(`\n--- seed ${r.seed}: last second`);
            for (const t of r.trace.tail) console.log('  ' + JSON.stringify(t));
            console.log(r.trace.map);
        }
    }
    if (rows.length) summarize(rows, cfg);
}

main();
