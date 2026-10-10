/**
 * LAVICE — SUPERBOT
 *
 * A forward-simulating survival pilot. The game is almost fully predictable
 * (enemies home at fixed speeds, the terrain is a known noise function), so
 * instead of steering by potential fields the bot carries a copy of the game's
 * rules and plays candidate futures before it commits to anything.
 *
 *   TERRAIN   8px occupancy + clearance grid and a 16px walkable-region map,
 *             re-sampled a band of rows per frame (a full sweep every 0.1s).
 *   ROUTES    every 0.2s: for a dozen or two candidate destinations, walk the
 *             route for five seconds while the lava horde homes on us, then
 *             measure how much enemy-free ground is still reachable from
 *             there. The candidates are played out a few per frame, so no
 *             single frame pays for all of them. Enemies converge on wherever we go, so "far from them
 *             now" is a trap; "room left after they react" is what keeps us
 *             out of corners.
 *   PILOT     every frame: ~50 movement plans (plus ~57 dash plans when
 *             walking is about to cost HP) played 30 frames ahead with the
 *             game's exact rules — pursuit, contact, knockback, wall burn,
 *             dash immunity — and the first input of the cheapest one is used.
 *   GUNNER    every volley: fly a bullet down each of the 8 firing rays against
 *             the predicted enemies and shoot only if the first thing it meets
 *             is something worth killing.
 *
 * Doctrine. The spawn rate climbs with score, so every kill is paid for later
 * in extra enemies. 'endurance' (default) kills only ice dust — fast, one hit,
 * cheap — and out-manoeuvres lava debris instead of feeding the wave.
 * 'hunter' kills everything it can reach.
 *
 * The bot acts only through the inputs a human has: the `keys` map (WASD +
 * arrows) and `tryDash()`.
 *
 * Engine contract — globals provided by the page: player, enemies, keys,
 * width, height, gameTime, frame, isGameOver, Simplex, tryDash, and optionally
 * CELL_SIZE / NOISE_SCALE / TIME_SCALE / WALL_THRESHOLD.
 */

const SuperBot = (() => {
    'use strict';

    const SQ = Math.SQRT1_2;
    // Direction 0 is "stand still"; 1..8 run clockwise from East (y is down).
    const MOVE_X = new Float64Array([0, 1, SQ, 0, -SQ, -1, -SQ, 0, SQ]);
    const MOVE_Y = new Float64Array([0, 0, SQ, 1, SQ, 0, -SQ, -1, -SQ]);
    const SHOT_X = new Int8Array([0, 1, 1, 0, -1, -1, -1, 0, 1]);
    const SHOT_Y = new Int8Array([0, 0, 1, 1, 1, 0, -1, -1, -1]);
    const rot = (d, k) => (((d - 1 + k) % 8) + 8) % 8 + 1;

    const FINE = 8;        // terrain grid cell (px)
    const NAV = 16;        // navigation grid cell (px)
    const COARSE = 32;     // enemy arrival-time grid cell (px)
    const BIG = 1e9;
    const POCKET_CELLS = 90;   // regions under ~150x150px count as pockets
    const SCAN_FRAMES = 6;     // frames for one full terrain sweep
    const SOON = 0.6;          // how far ahead (game time) the terrain forecast looks
    const SOON_SWEEPS = Math.round(SOON / 0.01 / SCAN_FRAMES);  // ...which is this many sweeps
    const ROUTES_PER_TICK = 4; // candidate routes played out per frame
    const PACK_CELL = 3;       // enemies sharing a cell this size (px) are handled as one pack

    // Game rules mirrored by the internal simulator.
    const RULE = {
        dashFrames: 8,
        contactDamage: 10,
        knockback: 20,
        bulletSpeed: 12,
        bulletLife: 50,
        bulletHitPad: 8,
        fireEvery: 8,
        burnInside: 0.5,
        burnTouch: 0.2,
        slowInside: 0.2
    };

    class MinHeap {
        constructor(cap) {
            this.keys = new Float32Array(cap);
            this.ids = new Int32Array(cap);
            this.n = 0;
        }
        clear() { this.n = 0; }
        push(key, id) {
            let i = this.n++;
            if (i >= this.keys.length) {
                const k2 = new Float32Array(this.keys.length * 2); k2.set(this.keys); this.keys = k2;
                const i2 = new Int32Array(this.ids.length * 2); i2.set(this.ids); this.ids = i2;
            }
            const keys = this.keys, ids = this.ids;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (keys[p] <= key) break;
                keys[i] = keys[p]; ids[i] = ids[p];
                i = p;
            }
            keys[i] = key; ids[i] = id;
        }
        pop() {
            const keys = this.keys, ids = this.ids;
            const top = ids[0];
            const n = --this.n;
            if (n > 0) {
                const key = keys[n], id = ids[n];
                let i = 0;
                for (;;) {
                    let c = 2 * i + 1;
                    if (c >= n) break;
                    if (c + 1 < n && keys[c + 1] < keys[c]) c++;
                    if (keys[c] >= key) break;
                    keys[i] = keys[c]; ids[i] = ids[c];
                    i = c;
                }
                keys[i] = key; ids[i] = id;
            }
            return top;
        }
    }

    const DEFAULTS = {
        doctrine: 'endurance',  // 'endurance' | 'hunter'
        horizon: 30,            // pilot rollout length, frames
        maxNear: 48,            // enemies simulated exactly per rollout...
        nearRadius: 380,        // ...within this many px
        dashPrice: 7,           // HP-equivalent cost of spending the dash
        dashConsider: 2.5,      // look at dash plans once walking is about to cost this much
        wPhi: 0.02,             // pull toward the chosen destination, per px
        wShot: 1.0,             // how much lining up a wanted shot is worth
        mineShare: 0.2,         // lay the mine once this share of the swarm is in its lure...
        mineFloor: 6            // ...and never for fewer than this, until the timer runs down
    };

    class SuperBot {
        constructor(options) {
            this.opts = Object.assign({}, DEFAULTS, options || {});
            this.enabled = true;
            this.tick = 0;
            this.W = 0; this.H = 0;
            this.lastGameTime = -1;

            this.stats = { dashes: 0, shots: 0, mines: 0, dashWhy: { dodge: 0, wall: 0, breakout: 0 } };
            // Read-only telemetry for the HUD / tactical overlay.
            this.intel = { mode: 'BOOT', threat: 0, target: null, path: [], aim: 0, lock: null, lava: 0, ice: 0 };

            this.eCap = 0;
            this._growEnemies(256);
            const m = this.opts.maxNear;
            this.nearX = new Float64Array(m); this.nearY = new Float64Array(m);
            this.nearS = new Float64Array(m); this.nearR = new Float64Array(m);
            this.nearT = new Uint8Array(m); this.nearW = new Float64Array(m);
            this.nearN = new Float64Array(m);
            this.simX = new Float64Array(m); this.simY = new Float64Array(m);
            this.simStuck = new Uint8Array(m);
            this.nearCount = 0;

            this.planX = new Float64Array(64); this.planY = new Float64Array(64);
            this.shotCand = new Int32Array(160); this.shotX = new Float64Array(160); this.shotY = new Float64Array(160);
            this.hordeCap = 180;
            this.hordeX = new Float64Array(this.hordeCap); this.hordeY = new Float64Array(this.hordeCap);
            this.hordeS = new Float64Array(this.hordeCap); this.hordeR = new Float64Array(this.hordeCap);
            this.simHX = new Float64Array(this.hordeCap); this.simHY = new Float64Array(this.hordeCap);
            this.hordeHist = new Int32Array(64);
            this.hordeN = 0;
            this.planLen = 0;
            this.last = { d1: 0, n1: 0, d2: 0, n2: 0, d3: 0 };
            this.rc = { risk: 0, urgent: 0, hits: 0, burn: 0 };
            this.heap = new MinHeap(4096);
            this.target = null;
            this.targetCell = -1;
            this.phiPending = false;
            this.routeK = 0;        // candidate routes still being scored (0 = none)
            this.scanRow = 0;
        }

        // ---------------------------------------------------------------- setup

        _growEnemies(cap) {
            this.eCap = cap;
            this.eX = new Float64Array(cap); this.eY = new Float64Array(cap);
            this.eS = new Float64Array(cap); this.eR = new Float64Array(cap);
            this.eT = new Uint8Array(cap);
            this.eD = new Float64Array(cap);
            this.eOrder = new Int32Array(cap);
            // packs: enemies of one kind standing on the same spot
            this.pX = new Float64Array(cap); this.pY = new Float64Array(cap);
            this.pS = new Float64Array(cap); this.pR = new Float64Array(cap);
            this.pT = new Uint8Array(cap); this.pD = new Float64Array(cap);
            this.pCount = new Int32Array(cap);
            this.pN = 0;
            let size = 64;
            while (size < cap * 4) size *= 2;
            this.hMask = size - 1;
            this.hKey = new Int32Array(size); this.hPack = new Int32Array(size); this.hGen = new Int32Array(size);
            this.hStamp = 0;
        }

        _resize(W, H) {
            this.W = W; this.H = H;
            this.gw = Math.ceil(W / FINE); this.gh = Math.ceil(H / FINE);
            const n = this.gw * this.gh;
            this.solid = new Uint8Array(n);
            this.soon = new Uint8Array(n);
            // past forecasts, one per sweep, and the game time each row was forecast for
            this.fore = []; this.foreT = [];
            for (let i = 0; i < SOON_SWEEPS; i++) { this.fore.push(new Uint8Array(n)); this.foreT.push(new Float64Array(this.gh).fill(-1)); }
            this.sweep = 0;
            this.clr = new Float32Array(n);
            this.nw = Math.ceil(this.gw / 2); this.nh = Math.ceil(this.gh / 2);
            const nn = this.nw * this.nh;
            this.navOpen = new Uint8Array(nn);
            this.navCost = new Float32Array(nn);
            this.navClr = new Float32Array(nn);
            this.navDyn = new Float32Array(nn);
            this.navSafe = new Float32Array(nn);
            this.freedom = new Float32Array(nn);
            this.prior = new Float32Array(nn);
            this.sat = new Float64Array((this.nw + 1) * (this.nh + 1));
            this.par = new Int32Array(nn);
            this.comp = new Int32Array(nn);
            this.compSize = new Int32Array(nn + 2);
            this.stamp = new Int32Array(nn);
            this.seen = new Int32Array(nn);
            this.depth = new Uint8Array(nn);
            this.queue = new Int32Array(nn);
            this.stampGen = 0;
            this.route = new Int32Array(400);
            // candidate lattice: roughly one destination per 260px square
            this.latX = Math.max(3, Math.min(6, Math.round(W / 260)));
            this.latY = Math.max(2, Math.min(4, Math.round(H / 240)));
            this.candCell = new Int32Array(this.latX * this.latY + 2);
            this.candU = new Float32Array(this.latX * this.latY + 2);
            this.tp = new Float32Array(nn);
            this.phi = new Float32Array(nn).fill(0);
            this.done = new Uint8Array(nn);
            this.cw = Math.ceil(W / COARSE); this.ch = Math.ceil(H / COARSE);
            this.tE = new Float32Array(this.cw * this.ch);
            this.target = null; this.targetCell = -1;
            this.phiPending = false;
            this.routeK = 0;
            this.terrainStamp = -999;
        }

        _reset() {
            this.target = null; this.targetCell = -1;
            this.phiPending = false;
            this.routeK = 0;
            this.last.d1 = 0; this.last.n1 = 0; this.last.d2 = 0; this.last.n2 = 0; this.last.d3 = 0;
            this.terrainStamp = -999;
            this.planLen = 0;
        }

        // -------------------------------------------------------------- terrain

        /**
         * Keep the terrain picture fresh without ever paying for the whole
         * arena in one frame: each call samples one band of rows, and when a
         * sweep completes (every SCAN_FRAMES frames) the derived grids are
         * rebuilt. The very first look takes everything at once.
         */
        _scanTerrain() {
            const gh = this.gh;
            if (this.terrainStamp < 0) {
                this._sampleRows(0, gh);
                this._buildGrids();
                this.scanRow = 0;
                return;
            }
            const j1 = Math.min(gh, this.scanRow + Math.ceil(gh / SCAN_FRAMES));
            this._sampleRows(this.scanRow, j1);
            this.scanRow = j1;
            if (j1 >= gh) { this._buildGrids(); this.scanRow = 0; this.sweep++; }
        }

        /**
         * Where lavice is now (`solid`) and where it will be in 0.6s (`soon`).
         * The forecast made for a row ten sweeps ago was made for exactly this
         * moment, so it is today's `solid` and only the new forecast needs the
         * noise function. Rows whose old forecast was for some other moment
         * (first look, a restart, time spent under manual control) are sampled
         * outright.
         */
        _sampleRows(j0, j1) {
            const gw = this.gw, W = this.W, H = this.H;
            const solid = this.solid, soon = this.soon;
            const noise = Simplex.noise3D;
            const NS = this.NS, TH = this.TH;
            const tz = gameTime * this.TS, tz2 = (gameTime + SOON) * this.TS;
            const slot = this.sweep % SOON_SWEEPS;
            const fore = this.fore[slot], foreT = this.foreT[slot];
            for (let j = j0; j < j1; j++) {
                const y = j * FINE + FINE / 2;
                const known = Math.abs(foreT[j] - gameTime) < 1e-6;
                foreT[j] = gameTime + SOON;
                let k = j * gw;
                for (let i = 0; i < gw; i++, k++) {
                    const x = i * FINE + FINE / 2;
                    if (x > W || y > H) { solid[k] = 1; soon[k] = 1; fore[k] = 1; continue; }
                    solid[k] = known ? fore[k] : (noise(x * NS, y * NS, tz) > TH ? 1 : 0);
                    soon[k] = fore[k] = noise(x * NS, y * NS, tz2) > TH ? 1 : 0;
                }
            }
        }

        /** Clearance, navigation cells and walkable regions from the sampled terrain. */
        _buildGrids() {
            const gw = this.gw, gh = this.gh, W = this.W, H = this.H;
            const solid = this.solid, soon = this.soon, clr = this.clr;
            // seeds: zero on lavice (present or imminent), distance to the arena border elsewhere
            for (let j = 0, k = 0; j < gh; j++) {
                const y = j * FINE + FINE / 2;
                for (let i = 0; i < gw; i++, k++) {
                    const x = i * FINE + FINE / 2;
                    clr[k] = (solid[k] | soon[k]) ? 0 : Math.min(x, W - x, y, H - y) + FINE / 2;
                }
            }
            // two-pass chamfer distance transform (px)
            const a = FINE, b = FINE * Math.SQRT2;
            for (let j = 0; j < gh; j++) {
                for (let i = 0; i < gw; i++) {
                    const c = j * gw + i;
                    let v = clr[c];
                    if (v === 0) continue;
                    if (i > 0 && clr[c - 1] + a < v) v = clr[c - 1] + a;
                    if (j > 0) {
                        if (clr[c - gw] + a < v) v = clr[c - gw] + a;
                        if (i > 0 && clr[c - gw - 1] + b < v) v = clr[c - gw - 1] + b;
                        if (i < gw - 1 && clr[c - gw + 1] + b < v) v = clr[c - gw + 1] + b;
                    }
                    clr[c] = v;
                }
            }
            for (let j = gh - 1; j >= 0; j--) {
                for (let i = gw - 1; i >= 0; i--) {
                    const c = j * gw + i;
                    let v = clr[c];
                    if (v === 0) continue;
                    if (i < gw - 1 && clr[c + 1] + a < v) v = clr[c + 1] + a;
                    if (j < gh - 1) {
                        if (clr[c + gw] + a < v) v = clr[c + gw] + a;
                        if (i < gw - 1 && clr[c + gw + 1] + b < v) v = clr[c + gw + 1] + b;
                        if (i > 0 && clr[c + gw - 1] + b < v) v = clr[c + gw - 1] + b;
                    }
                    clr[c] = v;
                }
            }
            for (let c = 0; c < clr.length; c++) clr[c] = clr[c] > FINE / 2 ? clr[c] - FINE / 2 : 0;

            // navigation grid (2x2 fine cells)
            const nw = this.nw, nh = this.nh, navOpen = this.navOpen, navCost = this.navCost, navClr = this.navClr;
            for (let J = 0; J < nh; J++) {
                for (let I = 0; I < nw; I++) {
                    const n = J * nw + I;
                    const i0 = I * 2, j0 = J * 2;
                    let open = 1, c = BIG, fut = 0;
                    for (let dj = 0; dj < 2; dj++) {
                        for (let di = 0; di < 2; di++) {
                            const i = i0 + di, j = j0 + dj;
                            if (i >= gw || j >= gh) { open = 0; continue; }
                            const kk = j * gw + i;
                            if (solid[kk]) open = 0;
                            if (soon[kk]) fut = 1;
                            if (clr[kk] < c) c = clr[kk];
                        }
                    }
                    navOpen[n] = open;
                    navClr[n] = open ? c : 0;
                    // hugging walls is expensive, future walls more so
                    let cost = 1;
                    if (c < 26) cost += (26 - c) / 26 * 2.2;
                    if (fut) cost += 2.5;
                    navCost[n] = cost;
                }
            }
            // connected regions of walkable ground, and how big each one is
            const comp = this.comp, sizes = this.compSize, queue = this.queue;
            comp.fill(0);
            let label = 0;
            for (let c0 = 0, nn = nw * nh; c0 < nn; c0++) {
                if (!navOpen[c0] || comp[c0] !== 0) continue;
                label++;
                let head = 0, tail = 0;
                queue[tail++] = c0; comp[c0] = label;
                while (head < tail) {
                    const c = queue[head++];
                    const ci = c % nw;
                    if (ci > 0 && navOpen[c - 1] && comp[c - 1] === 0) { comp[c - 1] = label; queue[tail++] = c - 1; }
                    if (ci < nw - 1 && navOpen[c + 1] && comp[c + 1] === 0) { comp[c + 1] = label; queue[tail++] = c + 1; }
                    if (c >= nw && navOpen[c - nw] && comp[c - nw] === 0) { comp[c - nw] = label; queue[tail++] = c - nw; }
                    if (c < nn - nw && navOpen[c + nw] && comp[c + nw] === 0) { comp[c + nw] = label; queue[tail++] = c + nw; }
                }
                sizes[label] = tail;
            }
            this.terrainStamp = this.tick;
        }

        /**
         * Cost of standing in a small walled-in pocket. Enemies cannot walk in,
         * but they can still touch us through a thin wall, knockback then
         * embeds us in it, and there is nowhere to run when the pocket closes.
         */
        _pocketCost(x, y) {
            const nw = this.nw, nh = this.nh, navOpen = this.navOpen;
            const I = (x / NAV) | 0, J = (y / NAV) | 0;
            if (I < 0 || J < 0 || I >= nw || J >= nh) return 0;
            let c = J * nw + I;
            if (!navOpen[c]) {
                // hugging a wall: take the nearest walkable cell within two steps
                let best = -1, bd = 99;
                for (let dj = -2; dj <= 2; dj++) {
                    const j = J + dj;
                    if (j < 0 || j >= nh) continue;
                    for (let di = -2; di <= 2; di++) {
                        const i = I + di;
                        if (i < 0 || i >= nw || !navOpen[j * nw + i]) continue;
                        const d = di * di + dj * dj;
                        if (d < bd) { bd = d; best = j * nw + i; }
                    }
                }
                if (best < 0) return 14;        // nothing walkable around at all
                c = best;
            }
            const size = this.compSize[this.comp[c]];
            return size < POCKET_CELLS ? (1 - size / POCKET_CELLS) * 14 : 0;
        }

        /** Exact wall test for the player at a given noise-z. Cheap far from walls. */
        _wallP(x, y, tz) {
            if (x < 0 || x > this.W || y < 0 || y > this.H) return true;
            const k = ((y * 0.125) | 0) * this.gw + ((x * 0.125) | 0);
            if (this.clr[k] > 14) return false;
            return Simplex.noise3D(x * this.NS, y * this.NS, tz) > this.TH;
        }

        _clrAt(x, y) {
            if (x < 0 || x >= this.W || y < 0 || y >= this.H) return 0;
            return this.clr[((y * 0.125) | 0) * this.gw + ((x * 0.125) | 0)];
        }

        /** Straight-line bullet visibility on the terrain grid. */
        _los(x0, y0, x1, y1) {
            const dx = x1 - x0, dy = y1 - y0;
            const d = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.ceil(d / 10);
            if (steps <= 1) return true;
            const sx = dx / steps, sy = dy / steps;
            const solid = this.solid, gw = this.gw;
            let x = x0, y = y0;
            for (let i = 1; i < steps; i++) {
                x += sx; y += sy;
                if (solid[((y * 0.125) | 0) * gw + ((x * 0.125) | 0)] === 1) return false;
            }
            return true;
        }

        // -------------------------------------------------------------- enemies

        /** What hitting this kind of enemy is worth; 0 means hold fire. */
        _targetValue(type) {
            if (type === 1) return 10;                              // ice dust: always
            return this.opts.doctrine === 'hunter' ? 3 : 0;        // lava debris: only when hunting
        }

        /**
         * Copy the enemies out of the game and fold them into packs. Late in a
         * run most of the swarm stands in a few dozen piles: debris homing on
         * the same target converges onto the same pixels and then moves as one.
         * A pile of sixty is simulated as one body that counts sixty times,
         * which is exact while they stay together and costs one sixtieth.
         */
        _snapshotEnemies() {
            const n = enemies.length;
            if (n > this.eCap) this._growEnemies(Math.max(n, this.eCap * 2));
            const eX = this.eX, eY = this.eY, eS = this.eS, eR = this.eR, eT = this.eT, eD = this.eD;
            const pX = this.pX, pY = this.pY, pS = this.pS, pR = this.pR, pT = this.pT, pD = this.pD, pCount = this.pCount;
            const hKey = this.hKey, hPack = this.hPack, hGen = this.hGen, mask = this.hMask;
            const stamp = ++this.hStamp;
            const px = player.x, py = player.y;
            const INV = 1 / PACK_CELL;
            let lava = 0, ice = 0, pn = 0;
            for (let i = 0; i < n; i++) {
                const e = enemies[i];
                const x = e.x, y = e.y;
                eX[i] = x; eY[i] = y; eS[i] = e.speed; eR[i] = e.radius;
                const t = e.type === 'ice_dust' ? 1 : 0;
                eT[i] = t;
                if (t) ice++; else lava++;
                eD[i] = Math.sqrt((x - px) * (x - px) + (y - py) * (y - py));

                const key = (t << 24) | ((((y > 0 ? y : 0) * INV) & 4095) << 12) | (((x > 0 ? x : 0) * INV) & 4095);
                let h = (Math.imul(key, 0x9E3779B1) >>> 7) & mask;
                while (hGen[h] === stamp && hKey[h] !== key) h = (h + 1) & mask;
                if (hGen[h] === stamp) {
                    const c = hPack[h];
                    pX[c] += x; pY[c] += y; pCount[c]++;
                } else {
                    hGen[h] = stamp; hKey[h] = key; hPack[h] = pn;
                    pX[pn] = x; pY[pn] = y; pCount[pn] = 1;
                    pT[pn] = t; pS[pn] = e.speed; pR[pn] = e.radius;
                    pn++;
                }
            }
            this.eN = n;
            this.pN = pn;
            this.intel.lava = lava; this.intel.ice = ice;

            const R = this.opts.nearRadius;
            const order = this.eOrder;
            let cand = 0;
            for (let c = 0; c < pn; c++) {
                const k = pCount[c];
                if (k > 1) { pX[c] /= k; pY[c] /= k; }
                const d = Math.sqrt((pX[c] - px) * (pX[c] - px) + (pY[c] - py) * (pY[c] - py));
                pD[c] = d;
                if (d < R) order[cand++] = c;
            }

            // Keep the packs holding the closest `maxNear` enemies, oldest first,
            // so the rollout resolves knockback chains in the game loop's order.
            const maxNear = this.opts.maxNear;
            let total = 0;
            for (let k = 0; k < cand; k++) total += pCount[order[k]];
            let lo = R, hi = R, spare = 0;
            if (total > maxNear) {
                // bisect for the distance of the maxNear-th closest enemy
                let inside = 0;
                lo = 0;
                for (let it = 0; it < 12; it++) {
                    const mid = (lo + hi) / 2;
                    let cnt = 0;
                    for (let k = 0; k < cand; k++) if (pD[order[k]] <= mid) cnt += pCount[order[k]];
                    if (cnt > maxNear) hi = mid; else { lo = mid; inside = cnt; }
                }
                spare = maxNear - inside;     // the pack at the cut-off sends only this many
            }
            let m = 0;
            for (let k = 0; k < cand; k++) {
                const c = order[k], d = pD[c];
                let take = pCount[c];
                if (d > lo) {
                    if (d > hi || spare <= 0) continue;
                    if (take > spare) take = spare;
                    spare -= take;
                }
                this.nearX[m] = pX[c]; this.nearY[m] = pY[c];
                this.nearS[m] = pS[c]; this.nearR[m] = pR[c];
                this.nearT[m] = pT[c];
                this.nearN[m] = take;
                this.nearW[m] = this._targetValue(pT[c]);
                m++;
            }
            this.nearCount = m;
        }

        // ------------------------------------------------------------- strategy

        _dijkstra(start, out, navCost, par) {
            const nw = this.nw, nh = this.nh, navOpen = this.navOpen;
            if (par) par.fill(-1);
            const done = this.done, heap = this.heap;
            out.fill(BIG);
            done.fill(0);
            heap.clear();
            out[start] = 0;
            heap.push(0, start);
            const DIAG = NAV * Math.SQRT2;
            while (heap.n > 0) {
                const c = heap.pop();
                if (done[c]) continue;
                done[c] = 1;
                const base = out[c];
                const ci = c % nw, cj = (c / nw) | 0;
                const l = ci > 0, r = ci < nw - 1, u = cj > 0, d = cj < nh - 1;
                // orthogonal
                if (l && navOpen[c - 1] && !done[c - 1]) { const v = base + NAV * navCost[c - 1]; if (v < out[c - 1]) { out[c - 1] = v; if (par) par[c - 1] = c; heap.push(v, c - 1); } }
                if (r && navOpen[c + 1] && !done[c + 1]) { const v = base + NAV * navCost[c + 1]; if (v < out[c + 1]) { out[c + 1] = v; if (par) par[c + 1] = c; heap.push(v, c + 1); } }
                if (u && navOpen[c - nw] && !done[c - nw]) { const v = base + NAV * navCost[c - nw]; if (v < out[c - nw]) { out[c - nw] = v; if (par) par[c - nw] = c; heap.push(v, c - nw); } }
                if (d && navOpen[c + nw] && !done[c + nw]) { const v = base + NAV * navCost[c + nw]; if (v < out[c + nw]) { out[c + nw] = v; if (par) par[c + nw] = c; heap.push(v, c + nw); } }
                // diagonal (no corner cutting)
                if (l && u && navOpen[c - nw - 1] && navOpen[c - 1] && navOpen[c - nw] && !done[c - nw - 1]) { const v = base + DIAG * navCost[c - nw - 1]; if (v < out[c - nw - 1]) { out[c - nw - 1] = v; if (par) par[c - nw - 1] = c; heap.push(v, c - nw - 1); } }
                if (r && u && navOpen[c - nw + 1] && navOpen[c + 1] && navOpen[c - nw] && !done[c - nw + 1]) { const v = base + DIAG * navCost[c - nw + 1]; if (v < out[c - nw + 1]) { out[c - nw + 1] = v; if (par) par[c - nw + 1] = c; heap.push(v, c - nw + 1); } }
                if (l && d && navOpen[c + nw - 1] && navOpen[c - 1] && navOpen[c + nw] && !done[c + nw - 1]) { const v = base + DIAG * navCost[c + nw - 1]; if (v < out[c + nw - 1]) { out[c + nw - 1] = v; if (par) par[c + nw - 1] = c; heap.push(v, c + nw - 1); } }
                if (r && d && navOpen[c + nw + 1] && navOpen[c + 1] && navOpen[c + nw] && !done[c + nw + 1]) { const v = base + DIAG * navCost[c + nw + 1]; if (v < out[c + nw + 1]) { out[c + nw + 1] = v; if (par) par[c + nw + 1] = c; heap.push(v, c + nw + 1); } }
            }
        }

        _navCellNear(x, y) {
            // nearest open nav cell to a world position (spiral search)
            const nw = this.nw, nh = this.nh, navOpen = this.navOpen;
            const I = Math.max(0, Math.min(nw - 1, (x / NAV) | 0)), J = Math.max(0, Math.min(nh - 1, (y / NAV) | 0));
            if (navOpen[J * nw + I]) return J * nw + I;
            for (let r = 1; r < 12; r++) {
                let best = -1, bd = BIG;
                for (let dj = -r; dj <= r; dj++) {
                    for (let di = -r; di <= r; di++) {
                        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
                        const i = I + di, j = J + dj;
                        if (i < 0 || j < 0 || i >= nw || j >= nh) continue;
                        if (!navOpen[j * nw + i]) continue;
                        const d = di * di + dj * dj;
                        if (d < bd) { bd = d; best = j * nw + i; }
                    }
                }
                if (best >= 0) return best;
            }
            return -1;
        }

        /**
         * The pull field toward the chosen cell is a second full Dijkstra, so
         * it is left for the next frame to keep any one frame cheap — except
         * the very first time, when there is no older field to steer by.
         */
        _queuePhi(now) {
            if (now) { this._dijkstra(this.targetCell, this.phi, this.navDyn, null); this.phiPending = false; }
            else this.phiPending = true;
        }

        _strategize() {
            const first = this.target === null;
            this.routeK = 0;
            const W = this.W, H = this.H;
            const cw = this.cw, ch = this.ch, tE = this.tE;
            const eX = this.pX, eY = this.pY, eS = this.pS, eR = this.pR, eT = this.pT, n = this.pN;
            const PR = player.radius;

            // 1. Earliest enemy arrival (frames) on the coarse grid, splatted
            //    per enemy and capped. Ice dust is a gunnery problem, not a
            //    positioning one, so it is discounted here — otherwise every
            //    dart would poison a 300px disc.
            const T_CAP = 150;
            tE.fill(T_CAP);
            for (let k = 0; k < n; k++) {
                const v = eT[k] ? 2.2 : eS[k];
                const pad = eR[k] + PR;
                const R = T_CAP * v + pad;
                const ex = eX[k], ey = eY[k];
                const i0 = Math.max(0, ((ex - R) / COARSE) | 0), i1 = Math.min(cw - 1, ((ex + R) / COARSE) | 0);
                const j0 = Math.max(0, ((ey - R) / COARSE) | 0), j1 = Math.min(ch - 1, ((ey + R) / COARSE) | 0);
                for (let j = j0; j <= j1; j++) {
                    const dy = j * COARSE + COARSE / 2 - ey;
                    for (let i = i0; i <= i1; i++) {
                        const dx = i * COARSE + COARSE / 2 - ex;
                        const tt = (Math.sqrt(dx * dx + dy * dy) - pad) / v;
                        const c = j * cw + i;
                        if (tt < tE[c]) tE[c] = tt < 0 ? 0 : tt;
                    }
                }
            }

            // 2. Per-cell travel cost (walls + enemy proximity) and how safe each
            //    cell is to stand on, 0..1: open, not about to freeze over, with
            //    time in hand before the nearest enemy can arrive.
            const nw = this.nw, nh = this.nh, navOpen = this.navOpen, navClr = this.navClr;
            const navCost = this.navCost, dyn = this.navDyn, safe = this.navSafe, sat = this.sat;
            const SAFE_T = 90, PATH_T = 55;
            for (let J = 0, c = 0; J < nh; J++) {
                const cj = Math.min(ch - 1, (J * NAV + NAV / 2) / COARSE | 0) * cw;
                for (let I = 0; I < nw; I++, c++) {
                    const te = tE[cj + Math.min(cw - 1, (I * NAV + NAV / 2) / COARSE | 0)];
                    let cost = navCost[c];
                    if (te < PATH_T) cost += (1 - te / PATH_T) * 6;
                    dyn[c] = cost;
                    safe[c] = (!navOpen[c] || navCost[c] >= 3.4) ? 0
                        : (te >= SAFE_T ? 1 : te / SAFE_T) * (navClr[c] >= 18 ? 1 : navClr[c] / 18);
                }
            }
            // summed-area table of safety
            const sw = nw + 1;
            for (let i = 0; i <= nw; i++) sat[i] = 0;
            for (let J = 0; J < nh; J++) {
                let row = 0;
                sat[(J + 1) * sw] = 0;
                for (let I = 0; I < nw; I++) {
                    row += safe[J * nw + I];
                    sat[(J + 1) * sw + I + 1] = sat[J * sw + I + 1] + row;
                }
            }

            // 3. our own travel cost to everywhere (with the tree, for routes)
            const start = this._navCellNear(player.x, player.y);
            if (start < 0) { this.target = null; this.targetCell = -1; return; }
            const tp = this.tp, par = this.par;
            this._dijkstra(start, tp, dyn, par);

            // 4. Freedom: the average safety of a ~300px box around a cell.
            //    Ground outside the arena scores zero, so corners and edges
            //    never look roomy. The best cell of each lattice region becomes
            //    a candidate destination.
            const RB = 9, boxArea = (2 * RB + 1) * (2 * RB + 1);
            const freedom = this.freedom;
            const LX = this.latX, LY = this.latY;
            const candCell = this.candCell, candU = this.candU;
            const comp = this.comp, compSize = this.compSize;
            const K0 = LX * LY;
            const prior = this.prior;
            for (let k = 0; k < K0; k++) { candCell[k] = -1; candU[k] = -BIG; }
            for (let J = 0, c = 0; J < nh; J++) {
                const j0 = Math.max(0, J - RB), j1 = Math.min(nh, J + RB + 1);
                const y = J * NAV + NAV / 2;
                const ly = Math.min(LY - 1, (y / H * LY) | 0) * LX;
                for (let I = 0; I < nw; I++, c++) {
                    if (!navOpen[c]) { freedom[c] = 0; prior[c] = -BIG; continue; }
                    const i0 = Math.max(0, I - RB), i1 = Math.min(nw, I + RB + 1);
                    const f = (sat[j1 * sw + i1] - sat[j0 * sw + i1] - sat[j1 * sw + i0] + sat[j0 * sw + i0]) / boxArea;
                    freedom[c] = f;
                    const x = I * NAV + NAV / 2;
                    const te = tE[Math.min(ch - 1, y / COARSE | 0) * cw + Math.min(cw - 1, x / COARSE | 0)];
                    // How good a place this is to stand, before any route is played
                    // out. Every candidate — including "stay where we are" — is
                    // judged by the same yardstick.
                    let u = f * 100 + Math.min(te, 140) / 140 * 22 + Math.min(navClr[c], 56) / 56 * 10;
                    const edge = Math.min(x, y, W - x, H - y);
                    if (edge < 180) u -= (180 - edge) * 0.12;                       // the border is a wall we cannot dash through
                    if (edge < 90) u -= (90 - edge) * (edge < 44 ? 1.6 : 0.5);
                    if (compSize[comp[c]] < POCKET_CELLS) u -= 40;
                    prior[c] = u;
                    if (tp[c] >= BIG || navClr[c] < 14 || navCost[c] >= 3.4) continue;
                    const k = ly + Math.min(LX - 1, (x / W * LX) | 0);
                    if (u > candU[k]) { candU[k] = u; candCell[k] = c; }
                }
            }

            // 4b. Walled into a pocket: nothing we can walk to is worth having.
            //     Aim for the best ground in a real region nearby instead, so
            //     the pilot sees a breakout dash as progress.
            if (compSize[comp[start]] < POCKET_CELLS) {
                let out = -1, outU = -BIG;
                const bx = player.x, by = player.y;
                for (let J = 0, c = 0; J < nh; J++) {
                    const y = J * NAV + NAV / 2;
                    for (let I = 0; I < nw; I++, c++) {
                        if (!navOpen[c] || compSize[comp[c]] < POCKET_CELLS * 3 || navClr[c] < 14 || navCost[c] >= 3.4) continue;
                        const x = I * NAV + NAV / 2;
                        const d = Math.sqrt((x - bx) * (x - bx) + (y - by) * (y - by));
                        const te = tE[Math.min(ch - 1, y / COARSE | 0) * cw + Math.min(cw - 1, x / COARSE | 0)];
                        const u = freedom[c] * 100 + Math.min(te, 140) / 140 * 22 + Math.min(navClr[c], 56) / 56 * 10 - d * 0.16;
                        if (u > outU) { outU = u; out = c; }
                    }
                }
                if (out >= 0) {
                    this.targetCell = out;
                    this.target = { x: (out % nw) * NAV + NAV / 2, y: ((out / nw) | 0) * NAV + NAV / 2 };
                    this._queuePhi(first);
                    const path = this.intel.path;
                    path.length = 0;
                    path.push({ x: player.x, y: player.y }, { x: this.target.x, y: this.target.y });
                    this.intel.target = this.target;
                    return;
                }
            }

            // 5. Play each candidate route forward against the horde and keep
            //    the one that leaves the most room afterwards. This is the
            //    expensive part (candidates x 5 s x horde), so only the very
            //    first decision is made on the spot. After that the candidates
            //    are scored a few per frame against this frame's snapshot, and
            //    the choice lands well before the next strategy tick.
            let K = K0;
            candCell[K] = start; candU[K] = prior[start]; K++;                             // staying put
            if (this.targetCell >= 0 && navOpen[this.targetCell] && tp[this.targetCell] < BIG) {
                candCell[K] = this.targetCell; candU[K] = prior[this.targetCell]; K++;           // current plan
            }
            this._loadHorde();
            this.routeK = K; this.routeI = 0;
            this.routeStart = start;
            this.routeX = player.x; this.routeY = player.y;
            this.routeBest = -1; this.routeBestScore = -BIG;
            if (first) this._scoreRoutes(K);
        }

        /** Score the next `count` candidate routes; commit to the best once all are in. */
        _scoreRoutes(count) {
            const candCell = this.candCell, candU = this.candU, start = this.routeStart;
            const end = Math.min(this.routeK, this.routeI + count);
            for (let k = this.routeI; k < end; k++) {
                const c = candCell[k];
                if (c < 0) continue;
                let sc = this._scoreRoute(start, c) + candU[k] * 0.22;
                if (c === this.targetCell) sc += 7;
                if (sc > this.routeBestScore) { this.routeBestScore = sc; this.routeBest = c; }
            }
            this.routeI = end;
            if (end < this.routeK) return;
            this.routeK = 0;

            const first = this.target === null;
            const nw = this.nw, par = this.par;
            const best = this.routeBest < 0 ? start : this.routeBest;
            this.targetCell = best;
            this.target = { x: (best % nw) * NAV + NAV / 2, y: ((best / nw) | 0) * NAV + NAV / 2 };

            // 6. potential field: geodesic cost to that cell from everywhere
            this._queuePhi(first);

            // route polyline for the overlay
            const path = this.intel.path;
            path.length = 0;
            for (let c = best, guard = 0; c >= 0 && c !== start && guard < 240; c = par[c], guard++) {
                path.push({ x: (c % nw) * NAV + NAV / 2, y: ((c / nw) | 0) * NAV + NAV / 2 });
            }
            path.push({ x: player.x, y: player.y });
            path.reverse();
            this.intel.target = this.target;
        }

        /**
         * Copy the enemies that matter for a multi-second forecast: the packs
         * of lava debris nearest to us (a pile blocks a route like one body). Ice dust is left out on purpose — it is fast
         * enough to "catch" us on any coarse route, but it dies to one bullet,
         * so the gunner deals with it and the planner must not freeze over it.
         */
        _loadHorde() {
            const n = this.pN, cap = this.hordeCap;
            const eX = this.pX, eY = this.pY, eS = this.pS, eR = this.pR, eD = this.pD, eT = this.pT, count = this.pCount;
            const hx = this.hordeX, hy = this.hordeY, hs = this.hordeS, hr = this.hordeR;
            const PR = player.radius;
            // distance that keeps the nearest `cap` lava, from a coarse histogram
            const hist = this.hordeHist;
            hist.fill(0);
            let lava = 0;
            for (let i = 0; i < n; i++) { if (eT[i] === 0) { lava += count[i]; hist[Math.min(63, (eD[i] / 32) | 0)] += count[i]; } }
            let maxD = Infinity;
            if (lava > cap) {
                let acc = 0;
                for (let b = 0; b < 64; b++) { acc += hist[b]; if (acc >= cap) { maxD = (b + 1) * 32; break; } }
            }
            let m = 0;
            for (let i = 0; i < n && m < cap; i++) {
                if (eT[i] !== 0 || eD[i] > maxD) continue;
                hx[m] = eX[i]; hy[m] = eY[i]; hs[m] = eS[i]; hr[m] = eR[i] + PR; m++;
            }
            this.hordeN = m;
        }

        /**
         * Walk the tree route start -> dest in coarse steps while every horde
         * member homes on us, then measure the room left at the far end.
         */
        _scoreRoute(start, dest) {
            const nw = this.nw, par = this.par;
            const route = this.route;
            let len = 0;
            for (let c = dest; c !== start && c >= 0 && len < route.length; c = par[c]) route[len++] = c;

            const M = this.hordeN;
            const hx = this.hordeX, hy = this.hordeY, hs = this.hordeS, hr = this.hordeR;
            const qx = this.simHX, qy = this.simHY;
            for (let i = 0; i < M; i++) { qx[i] = hx[i]; qy[i] = hy[i]; }
            const solid = this.solid, gw = this.gw, W = this.W, H = this.H;

            const DT = 6, STEPS = 50;
            const stride = player.speed * DT;
            let bx = this.routeX, by = this.routeY, pi = len - 1;
            let pathLen = 0, contact = 0, firstContact = -1, minM = 999, arrived = len === 0 ? 0 : -1;

            for (let st = 0; st < STEPS; st++) {
                let remain = stride;
                while (remain > 0 && pi >= 0) {
                    const c = route[pi];
                    const wx = (c % nw) * NAV + NAV / 2, wy = ((c / nw) | 0) * NAV + NAV / 2;
                    const dx = wx - bx, dy = wy - by;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d <= remain) { bx = wx; by = wy; remain -= d; pathLen += d; pi--; }
                    else { bx += dx / d * remain; by += dy / d * remain; pathLen += remain; remain = 0; }
                }
                if (pi < 0 && arrived < 0) arrived = st;

                let touched = false;
                for (let i = 0; i < M; i++) {
                    const ex = qx[i], ey = qy[i];
                    const dx = bx - ex, dy = by - ey;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const m = dist - hr[i];
                    if (m < minM && arrived < 0) minM = m;
                    if (m < 5) { touched = true; continue; }
                    let step = hs[i] * DT;
                    if (step > m) step = m;
                    const ux = dx / dist, uy = dy / dist;
                    let nx = ex + ux * step, ny = ey + uy * step;
                    if (nx < 0 || nx > W || ny < 0 || ny > H || solid[((ny * 0.125) | 0) * gw + ((nx * 0.125) | 0)] === 1) {
                        nx = ex;
                        if (ny < 0 || ny > H || solid[((ny * 0.125) | 0) * gw + ((nx * 0.125) | 0)] === 1) ny = ey;
                    }
                    qx[i] = nx; qy[i] = ny;
                }
                if (touched) { contact++; if (firstContact < 0) firstContact = st; }
            }

            // room left around the end point once the horde has reacted
            const endCell = pi < 0 ? dest : this._navCellNear(bx, by);
            const room = this._roomAfter(endCell, qx, qy, M);

            let score = room * 100 - pathLen * 0.012;
            if (minM < 60) score -= (60 - Math.max(0, minM)) * 0.3;      // squeezing past enemies on the way
            if (firstContact >= 0) {
                score -= contact * 1.6;
                // being caught en route is worse than being reached after arriving
                if (arrived < 0 || firstContact < arrived) score -= 45;
            }
            return score;
        }

        /** Fraction of nearby ground still reachable without brushing an enemy. */
        _roomAfter(cell, qx, qy, M) {
            if (cell < 0) return 0;
            const nw = this.nw, nh = this.nh, navOpen = this.navOpen;
            const stamp = this.stamp, seen = this.seen, queue = this.queue;
            const gen = ++this.stampGen;
            for (let i = 0; i < M; i++) {
                const ex = qx[i], ey = qy[i];
                const I0 = Math.max(0, ((ex - 50) / NAV) | 0), I1 = Math.min(nw - 1, ((ex + 50) / NAV) | 0);
                const J0 = Math.max(0, ((ey - 50) / NAV) | 0), J1 = Math.min(nh - 1, ((ey + 50) / NAV) | 0);
                for (let J = J0; J <= J1; J++) {
                    const dy = J * NAV + NAV / 2 - ey;
                    for (let I = I0; I <= I1; I++) {
                        const dx = I * NAV + NAV / 2 - ex;
                        if (dx * dx + dy * dy < 2500) stamp[J * nw + I] = gen;
                    }
                }
            }
            const CAP = 640, DEPTH = 28;
            let head = 0, tail = 0, count = 0;
            queue[tail++] = cell; seen[cell] = gen; this.depth[cell] = 0;
            const depth = this.depth;
            while (head < tail && count < CAP) {
                const c = queue[head++];
                if (stamp[c] !== gen) count++;
                const d = depth[c];
                if (d >= DEPTH) continue;
                const ci = c % nw;
                if (ci > 0) { const q = c - 1; if (seen[q] !== gen && navOpen[q] && stamp[q] !== gen) { seen[q] = gen; depth[q] = d + 1; queue[tail++] = q; } }
                if (ci < nw - 1) { const q = c + 1; if (seen[q] !== gen && navOpen[q] && stamp[q] !== gen) { seen[q] = gen; depth[q] = d + 1; queue[tail++] = q; } }
                if (c >= nw) { const q = c - nw; if (seen[q] !== gen && navOpen[q] && stamp[q] !== gen) { seen[q] = gen; depth[q] = d + 1; queue[tail++] = q; } }
                if (c < nw * (nh - 1)) { const q = c + nw; if (seen[q] !== gen && navOpen[q] && stamp[q] !== gen) { seen[q] = gen; depth[q] = d + 1; queue[tail++] = q; } }
            }
            return count / CAP;
        }

        /** Continuous nav potential at a world position. */
        _phiAt(x, y) {
            const nw = this.nw, nh = this.nh, phi = this.phi, navOpen = this.navOpen;
            const I = Math.max(0, Math.min(nw - 1, (x / NAV) | 0)), J = Math.max(0, Math.min(nh - 1, (y / NAV) | 0));
            let best = BIG;
            for (let dj = -1; dj <= 1; dj++) {
                const j = J + dj; if (j < 0 || j >= nh) continue;
                for (let di = -1; di <= 1; di++) {
                    const i = I + di; if (i < 0 || i >= nw) continue;
                    const c = j * nw + i;
                    if (!navOpen[c]) continue;
                    const p = phi[c];
                    if (p >= BIG) continue;
                    const dx = x - (i * NAV + NAV / 2), dy = y - (j * NAV + NAV / 2);
                    const v = p + Math.sqrt(dx * dx + dy * dy);
                    if (v < best) best = v;
                }
            }
            if (best < BIG) return best;
            const t = this.target;
            return t ? 420 + 0.3 * Math.sqrt((x - t.x) * (x - t.x) + (y - t.y) * (y - t.y)) : 600;
        }

        // ---------------------------------------------------------------- pilot

        /**
         * Play one plan forward with the game's exact rules.
         * Plan: d1 for n1 frames, d2 for n2 frames, then d3. If dashStart, the
         * dash is triggered on frame 0.
         */
        _rollout(d1, n1, d2, n2, d3, dashStart, record, bound) {
            const o = this.opts;
            const Hn = o.horizon;
            const M = this.nearCount;
            const bx = this.nearX, by = this.nearY, bs = this.nearS, br = this.nearR, bt = this.nearT, bw = this.nearW, bn = this.nearN;
            const sx = this.simX, sy = this.simY, stuck = this.simStuck;
            for (let i = 0; i < M; i++) { sx[i] = bx[i]; sy[i] = by[i]; stuck[i] = 0; }
            const solid = this.solid, gw = this.gw;
            const W = this.W, H = this.H;
            const PR = player.radius, SPEED = player.speed, DASH = player.dashSpeed;
            const TS = this.TS;
            let px = player.x, py = player.y;
            let dashLeft = dashStart ? RULE.dashFrames : (player.isDashing ? player.dashDuration : 0);
            let hits = 0, hitCost = 0, burn = 0, prox = 0, shot = 0, landing = 0, lean = 0, outside = false;
            // frames of immunity after a hit, where the engine has them
            const GRACE = typeof TUNE !== 'undefined' && TUNE.hitGrace > 0 ? TUNE.hitGrace : 0;
            let grace = GRACE > 0 && typeof hitGrace === 'number' ? hitGrace : 0;
            const hp = player.hp;
            const hpW = 1 + (hp < 60 ? (60 - hp) / 60 * 1.5 : 0);
            const fr0 = frame;
            const gt0 = gameTime;
            const n12 = n1 + n2;

            for (let t = 0; t < Hn; t++) {
                const d = t < n1 ? d1 : (t < n12 ? d2 : d3);
                const mx = MOVE_X[d], my = MOVE_Y[d];
                const tz = (gt0 + 0.01 * (t + 1)) * TS;

                if (dashLeft > 0) {
                    px += mx * DASH; py += my * DASH;
                    dashLeft--;
                    if (dashLeft === 0) {
                        // touchdown: never outside the arena, and not shaving a shoreline
                        if (px < 0 || px > W || py < 0 || py > H) outside = true;
                        else if (this._wallP(px + 7, py, tz) || this._wallP(px - 7, py, tz) || this._wallP(px, py + 7, tz) || this._wallP(px, py - 7, tz)) landing += 3.5;
                    }
                } else {
                    // Same axis-separated move as the game. An axis we are not
                    // pushing on re-tests the spot we already stand on, so those
                    // probes are answered without another noise lookup.
                    let sp = SPEED;
                    const inside = this._wallP(px, py, tz);
                    if (inside) { sp *= RULE.slowInside; burn += RULE.burnInside; }
                    const nx = px + mx * sp, ny = py + my * sp;
                    const xBlocked = mx === 0 ? inside : this._wallP(nx, py, tz);
                    if (xBlocked) { burn += RULE.burnTouch; lean++; } else px = nx;
                    const yBlocked = my === 0 ? (xBlocked && inside) : this._wallP(px, ny, tz);
                    if (yBlocked) { burn += RULE.burnTouch; lean++; } else py = ny;
                }

                // gunnery: is a wanted target sitting on one of our 8 firing rays?
                if ((fr0 + t) % RULE.fireEvery === 0 && M > 0) {
                    let bv = 0, bi = -1;
                    for (let i = 0; i < M; i++) {
                        const w = bw[i];
                        if (w <= bv * 0.999) continue;
                        const ax = Math.abs(sx[i] - px), ay = Math.abs(sy[i] - py);
                        const along = ax > ay ? ax : ay;
                        if (along > 500) continue;
                        const card = ax < ay ? ax : ay;
                        const diag = Math.abs(ax - ay) * SQ;
                        const q = card < diag ? card : diag;
                        const hr = br[i] + RULE.bulletHitPad - 2;
                        if (q >= hr) continue;
                        let v = w * (hr - q > 5 ? 1 : (hr - q) / 5);
                        if (v > bv) { bv = v; bi = i; }
                    }
                    if (bi >= 0 && this._los(px, py, sx[bi], sy[bi])) shot += bv * (1 - 0.4 * t / Hn);
                }

                if (grace > 0) grace--;
                // enemies, newest first — same order as the game loop
                for (let i = M - 1; i >= 0; i--) {
                    const ex = sx[i], ey = sy[i];
                    const ddx = px - ex, ddy = py - ey;
                    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dist <= 0) continue;
                    const s = bs[i];
                    const ux = ddx / dist, uy = ddy / dist;
                    let nx = ex + ux * s, ny = ey + uy * s;
                    let st = 0;
                    if (nx < 0 || nx > W || ny < 0 || ny > H || solid[((ny * 0.125) | 0) * gw + ((nx * 0.125) | 0)] === 1) {
                        nx = ex; st = 1;
                        if (ny < 0 || ny > H || solid[((ny * 0.125) | 0) * gw + ((nx * 0.125) | 0)] === 1) { ny = ey; st = 2; }
                    }
                    sx[i] = nx; sy[i] = ny; stuck[i] = st;
                    const reach = PR + br[i];
                    if (dist < reach) {
                        if (dashLeft === 0 && grace === 0) {
                            // Each member of a pack hits in turn, as in the game: the
                            // knockback from one usually carries us clear of the next,
                            // unless the arena edge holds us in place.
                            let left = bn[i], vx = ux, vy = uy;
                            for (;;) {
                                hits++;
                                hitCost += 1 - 0.35 * t / Hn;
                                px += vx * RULE.knockback; py += vy * RULE.knockback;
                                if (px < PR) px = PR; else if (px > W - PR) px = W - PR;
                                if (py < PR) py = PR; else if (py > H - PR) py = H - PR;
                                if (GRACE > 0) { grace = GRACE; break; }
                                if (--left <= 0) break;
                                const ax = px - ex, ay = py - ey;
                                const ad = Math.sqrt(ax * ax + ay * ay);
                                if (ad >= reach || ad <= 0) break;
                                vx = ax / ad; vy = ay / ad;
                            }
                        }
                    } else {
                        const pad = bt[i] ? 26 : 16;
                        const m = dist - reach;
                        if (m < pad) { const q = 1 - m / pad; prox += q * q * (bt[i] ? 0.55 : 0.4) * bn[i]; }
                    }
                }
                if (record) { this.planX[t] = px; this.planY[t] = py; }
                else if ((t & 3) === 3) {
                    // Everything still to be added is >= 0 except gunnery, which is
                    // capped per remaining volley — so once the running damage alone
                    // exceeds the best plan found, this one cannot win.
                    const floor = (hitCost * RULE.contactDamage * 1.3 + burn * 1.6 + lean * 0.3 + prox) * hpW - (shot + ((Hn - t) >> 3) * 10 + 10) * o.wShot;
                    if (floor > bound) { this.rc.risk = floor; this.rc.hits = hits; this.rc.burn = burn; return BIG; }
                }
            }

            // ---- where does this leave us?
            let threat = 0;
            for (let i = 0; i < M; i++) {
                const dx = sx[i] - px, dy = sy[i] - py;
                const d = Math.sqrt(dx * dx + dy * dy) - PR - br[i];
                const R = bt[i] ? 230 : 130;
                if (d < R) {
                    const q = 1 - (d < 0 ? 0 : d) / R;
                    threat += q * q * (bt[i] ? 9 : 6) * (stuck[i] === 2 ? 0.3 : (stuck[i] === 1 ? 0.7 : 1)) * bn[i];
                }
            }
            let pos = 0;
            const c = this._clrAt(px, py);
            if (c < 44) { const q = 1 - c / 44; pos += q * q * 9; }
            const edge = Math.min(px, py, W - px, H - py);
            if (edge < 70) { const q = 1 - (edge < 0 ? 0 : edge) / 70; pos += q * q * 8; }
            if (px > 0 && px < W && py > 0 && py < H &&
                Simplex.noise3D(px * this.NS, py * this.NS, (gt0 + 0.7) * TS) > this.TH - 0.03) pos += 6;
            pos += this._pocketCost(px, py);
            const nav = this._phiAt(px, py) * o.wPhi;

            let risk = hitCost * RULE.contactDamage * 1.3 * hpW + (burn * 1.6 + lean * 0.3) * hpW + prox * hpW + threat;
            // Ending frozen inside lavice (or outside the arena, which the game
            // treats the same way) means burning until the next dash comes up.
            const tzEnd = (gt0 + 0.01 * Hn) * TS;
            risk += landing;
            if (outside || px < 0 || px > W || py < 0 || py > H) {
                // Out of bounds the game freezes and burns us. A knockback could
                // shove us back in, but that is not a plan.
                risk += 900;
            } else if (this._wallP(px, py, tzEnd)) {
                const cdEnd = dashStart ? player.dashMax - Hn : Math.max(0, player.dashCooldown - Hn);
                risk += (cdEnd * 0.9 + 14) * 1.6 * hpW;
            }
            if (hits * RULE.contactDamage + burn >= hp - 0.5) risk += 400;

            const rc = this.rc;
            rc.risk = risk; rc.hits = hits; rc.burn = burn;
            rc.urgent = risk - threat;      // what the plan itself runs into, as opposed to how exposed it ends up
            return risk + pos + nav - shot * o.wShot;
        }

        _consider(d1, n1, d2, n2, d3, dash, extra) {
            // a plan can only win if its floor stays under the incumbent (less its own bonuses)
            let c = this._rollout(d1, n1, d2, n2, d3, dash, false, this.bestCost - extra + 1) + extra;
            const last = this.last;
            if (!dash) {
                if (d1 === last.d1) c -= 0.3;
                else if (last.d1 !== 0 && d1 !== 0) {
                    const turn = Math.abs(((d1 - last.d1 + 12) % 8) - 4);  // 4 = same, 0 = reverse
                    if (turn <= 1) c += 0.5;
                }
            }
            if (c < this.bestCost) {
                this.bestCost = c;
                const b = this.best;
                b.d1 = d1; b.n1 = n1; b.d2 = d2; b.n2 = n2; b.d3 = d3; b.dash = dash;
                b.risk = this.rc.risk; b.hits = this.rc.hits; b.burn = this.rc.burn; b.urgent = this.rc.urgent;
            }
            return c;
        }

        _decideMove() {
            const o = this.opts;
            const Hn = o.horizon;
            this.best = this.best || { d1: 0, n1: 0, d2: 0, n2: 0, d3: 0, dash: false, risk: 0, hits: 0, burn: 0, urgent: 0 };
            this.bestCost = BIG;
            const dashing = player.isDashing;
            const rem = dashing ? player.dashDuration : 0;

            if (dashing) {
                // A dash is a commitment: keep its heading. The only freedoms
                // are where to go afterwards, cutting it short, or — if the
                // straight line has turned bad — a 45 degree bend.
                const hd = this.dashDir || this.last.d1;
                for (let d2 = 0; d2 <= 8; d2++) this._consider(hd, rem, d2, Hn, d2, false, 0);
                if (hd !== 0) {
                    for (let k = 0; k < rem; k++) {
                        this._consider(hd, k, 0, rem - k, hd, false, 0.4);
                        this._consider(hd, k, 0, rem - k, 0, false, 0.4);
                    }
                    for (const turn of [1, -1]) {
                        const hb = rot(hd, turn);
                        this._consider(hb, rem, hb, Hn, hb, false, 2.5);
                        this._consider(hb, rem, 0, Hn, 0, false, 2.5);
                    }
                } else {
                    for (let d = 1; d <= 8; d++) this._consider(d, rem, d, Hn, d, false, 1.5);
                }
            } else {
                this.dashDir = 0;
                for (let d = 0; d <= 8; d++) this._consider(d, Hn, d, 0, d, false, 0);
                for (let d = 1; d <= 8; d++) {
                    this._consider(d, 10, rot(d, 1), Hn, 0, false, 0);
                    this._consider(d, 10, rot(d, -1), Hn, 0, false, 0);
                    this._consider(d, 10, rot(d, 2), Hn, 0, false, 0);
                    this._consider(d, 10, rot(d, -2), Hn, 0, false, 0);
                    this._consider(d, 6, 0, Hn, 0, false, 0);
                }
                // continuation of the previous plan
                const l = this.last;
                if (l.n1 > 1) this._consider(l.d1, l.n1 - 1, l.d2, l.n2, l.d3, false, -0.15);
                else if (l.n2 > 1) this._consider(l.d2, l.n2 - 1, l.d3, 0, l.d3, false, -0.15);

                // The dash is the one get-out-of-jail card, so it is only on the
                // table when walking is about to cost HP (or we are walled in).
                const dashReady = player.dashCooldown <= 0;
                const pocketed = this._pocketCost(player.x, player.y) > 3;
                this.pocketed = pocketed;
                this.plainUrgent = this.best.urgent;
                if (dashReady && (this.best.urgent > o.dashConsider || pocketed)) {
                    const price = o.dashPrice;
                    for (let d = 1; d <= 8; d++) {
                        this._consider(d, 8, d, Hn, d, true, price);
                        this._consider(d, 8, 0, Hn, 0, true, price);
                        this._consider(d, 8, rot(d, 2), Hn, 0, true, price);
                        this._consider(d, 8, rot(d, -2), Hn, 0, true, price);
                        this._consider(d, 6, 0, 2, d, true, price);
                        this._consider(d, 4, 0, 4, 0, true, price);
                        this._consider(d, 2, 0, 6, 0, true, price);
                    }
                    this._consider(0, 8, 0, Hn, 0, true, price);
                }
            }

            const b = this.best;
            this._rollout(b.d1, b.n1, b.d2, b.n2, b.d3, b.dash, true, BIG);
            this.planLen = Hn;
            const l = this.last;
            l.d1 = b.d1; l.n1 = b.n1; l.d2 = b.d2; l.n2 = b.n2; l.d3 = b.d3;
            // normalise so "current direction" is always d1
            if (l.n1 <= 0) { l.d1 = l.d2; l.n1 = l.n2; l.d2 = l.d3; l.n2 = 0; if (l.n1 <= 0) { l.d1 = l.d3; l.n1 = Hn; } }

            if (b.dash) {
                tryDash();
                this.dashDir = b.d1;
                this.stats.dashes++;
                const why = this._wallP(player.x, player.y, gameTime * this.TS) ? 'wall' : (this.plainUrgent <= o.dashConsider ? 'breakout' : 'dodge');
                this.stats.dashWhy[why]++;
            }
            const d = l.d1;
            keys.KeyD = MOVE_X[d] > 0.1; keys.KeyA = MOVE_X[d] < -0.1;
            keys.KeyS = MOVE_Y[d] > 0.1; keys.KeyW = MOVE_Y[d] < -0.1;
            this.moveDir = d;
            const it = this.intel;
            it.threat += (Math.min(1, b.risk / 22) - it.threat) * 0.2;
            const firing = it.aim !== 0;
            it.mode = (player.isDashing || b.dash) ? 'PHASE'
                : b.risk > 14 ? 'EVADE'
                : d !== 0 ? (firing ? 'KITE' : 'RELOCATE')
                : (firing ? 'ENGAGE' : 'HOLD');
        }

        // --------------------------------------------------------------- gunner

        /**
         * Fly a bullet down one ray against the enemies that could plausibly
         * meet it, with enemies homing on our planned trajectory.
         * Returns the value of the first thing it hits (0 if nothing useful).
         */
        _predictShot(dir) {
            const vx = SHOT_X[dir] * RULE.bulletSpeed, vy = SHOT_Y[dir] * RULE.bulletSpeed;
            const vlen = Math.hypot(vx, vy);
            const ux = vx / vlen, uy = vy / vlen;
            const p0x = this.planX[0], p0y = this.planY[0];
            const eX = this.eX, eY = this.eY, eS = this.eS, eR = this.eR, eT = this.eT, n = this.eN;
            const range = vlen * RULE.bulletLife;

            // Candidates: anything inside a generous corridor around the ray,
            // newest first (the order the game resolves hits in). If a dense
            // horde overflows the buffer, the first hit is certainly close, so
            // retry with only the near stretch of the ray.
            const cand = this.shotCand, cx = this.shotX, cy = this.shotY, CAP = cand.length;
            let m = 0, reach = range + 40;
            for (let pass = 0; pass < 3; pass++) {
                m = 0;
                for (let i = n - 1; i >= 0 && m < CAP; i--) {
                    const rx = eX[i] - p0x, ry = eY[i] - p0y;
                    const along = rx * ux + ry * uy;
                    if (along < -20 || along > reach) continue;
                    if (Math.abs(rx * uy - ry * ux) > 70) continue;
                    cand[m] = i; cx[m] = eX[i]; cy[m] = eY[i]; m++;
                }
                if (m < CAP) break;
                reach *= 0.4;
            }
            if (m === 0) return 0;

            const solid = this.solid, gw = this.gw, W = this.W, H = this.H;
            let bx = p0x, by = p0y;
            const planLen = this.planLen;
            for (let t = 0; t < RULE.bulletLife - 1; t++) {
                bx += vx; by += vy;
                if (bx < 0 || bx > W || by < 0 || by > H) return 0;
                if (solid[((by * 0.125) | 0) * gw + ((bx * 0.125) | 0)] === 1) return 0;
                const pi = t < planLen ? t : planLen - 1;
                const px = this.planX[pi], py = this.planY[pi];
                for (let k = 0; k < m; k++) {       // cand is already newest-first
                    const i = cand[k];
                    const ddx = px - cx[k], ddy = py - cy[k];
                    const dist = Math.sqrt(ddx * ddx + ddy * ddy);
                    if (dist > 0) {
                        const s = eS[i];
                        const ex = cx[k], ey = cy[k];
                        let nx = ex + ddx / dist * s, ny = ey + ddy / dist * s;
                        if (nx < 0 || nx > W || ny < 0 || ny > H || solid[((ny * 0.125) | 0) * gw + ((nx * 0.125) | 0)] === 1) {
                            nx = ex;
                            if (ny < 0 || ny > H || solid[((ny * 0.125) | 0) * gw + ((nx * 0.125) | 0)] === 1) ny = ey;
                        }
                        cx[k] = nx; cy[k] = ny;
                    }
                    const hx = bx - cx[k], hy = by - cy[k];
                    const hr = eR[i] + RULE.bulletHitPad;
                    if (hx * hx + hy * hy < hr * hr) {
                        const w = this._targetValue(eT[i]);
                        if (w <= 0) return -1;
                        this._shotHit = i;
                        // sooner hits and closer threats are worth more
                        return w * (1.3 - t / RULE.bulletLife) + (this.eD[i] < 160 ? 3 : 0);
                    }
                }
            }
            return 0;
        }

        _decideFire() {
            keys.ArrowUp = false; keys.ArrowDown = false; keys.ArrowLeft = false; keys.ArrowRight = false;
            if (frame % RULE.fireEvery !== 0) return;
            if (this.eN === 0) { this.intel.aim = 0; this.intel.lock = null; return; }
            let best = 0, bv = 0, lock = -1;
            for (let d = 1; d <= 8; d++) {
                const v = this._predictShot(d);
                if (v > bv) { bv = v; best = d; lock = this._shotHit; }
            }
            this.intel.aim = best;
            this.intel.lock = lock >= 0 ? enemies[lock] : null;
            if (!best) return;
            if (SHOT_X[best] > 0) keys.ArrowRight = true; else if (SHOT_X[best] < 0) keys.ArrowLeft = true;
            if (SHOT_Y[best] > 0) keys.ArrowDown = true; else if (SHOT_Y[best] < 0) keys.ArrowUp = true;
            this.stats.shots++;
        }

        // ----------------------------------------------------------------- main

        think() {
            if (!this.enabled || isGameOver) return;
            if (gameTime < this.lastGameTime) this._reset();
            this.lastGameTime = gameTime;
            this.tick++;
            if (this.NS === undefined) {
                const cell = typeof CELL_SIZE !== 'undefined' ? CELL_SIZE : 8;
                this.NS = (typeof NOISE_SCALE !== 'undefined' ? NOISE_SCALE : 0.05) / cell;
                this.TS = typeof TIME_SCALE !== 'undefined' ? TIME_SCALE : 0.1;
                this.TH = typeof WALL_THRESHOLD !== 'undefined' ? WALL_THRESHOLD : 0.15;
            }
            if (width !== this.W || height !== this.H) this._resize(width, height);
            this._scanTerrain();
            this._snapshotEnemies();
            if (this.routeK > 0) this._scoreRoutes(ROUTES_PER_TICK);
            else if (this.phiPending && this.targetCell >= 0) { this._dijkstra(this.targetCell, this.phi, this.navDyn, null); this.phiPending = false; }
            else if (this.tick % 12 === 3 || !this.target) this._strategize();
            this._decideMove();
            this._decideFire();
            this._decideMine();
        }

        // The landmine exists only in Superbot mode's engine. It may be laid
        // 30 s after the last one and the engine lays it by itself at 60 s, so
        // the only choice is when. A live mine lures every enemy inside its
        // lure radius, so lay it under the bot when enough of the swarm is in
        // that radius with a clear run at it. The bar drops as the 60 s
        // deadline nears.
        _decideMine() {
            if (typeof mineReady !== 'function' || !mineReady()) return;
            if (player.isDashing) return;
            // not where the lavice is, or will be within 4 s: it would swallow the mine
            for (let k = 0; k <= 4; k++) {
                if (Simplex.noise3D(player.x * this.NS, player.y * this.NS, (gameTime + k * 0.6) * this.TS) > this.TH) return;
            }
            const reach = (MINE.lureRadius || MINE.blastRadius) * 0.9, r2 = reach * reach;
            let n = 0;
            for (let i = 0; i < enemies.length; i++) {
                const dx = enemies[i].x - player.x, dy = enemies[i].y - player.y;
                // only those with a clear run at the mine; a pack behind a wall never arrives to trip it
                if (dx * dx + dy * dy < r2 && this._los(player.x, player.y, enemies[i].x, enemies[i].y)) n++;
            }
            const left = 1 - (mineTimer - MINE.minDelay) / (MINE.maxDelay - MINE.minDelay);
            const need = Math.max(1, left * Math.max(this.opts.mineFloor, this.opts.mineShare * enemies.length));
            if (n >= need || (n >= 3 && player.hp < 40)) {
                if (tryPlaceMine()) this.stats.mines++;
            }
        }

        release() {
            for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) keys[k] = false;
        }

        debugLine() {
            const b = this.best || {};
            const t = this.target;
            return `d${b.d1}/${b.n1}>${b.d2}${b.dash ? ' DASH' : ''} c=${(this.bestCost || 0).toFixed(1)} r=${(b.risk || 0).toFixed(1)} h${b.hits || 0} near=${this.nearCount}` +
                (t ? ` tgt=${t.x | 0},${t.y | 0}` : '');
        }
    }

    return SuperBot;
})();

if (typeof window !== 'undefined') window.SuperBot = SuperBot;
