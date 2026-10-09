/**
 * V0ID SH!FTER - M4 SURVIVAL CORE BOT (v5.2)
 * 
 * 結合了傳統算法 (A*) 的穩定性與深度學習 (DQN) 的適應性。
 * 
 * 架構：
 * 1. Heuristic Teacher (A*): 負責導航和基礎生存，保證機器人不會一開始就撞牆。
 * 2. Deep Q-Network (TF.js): 負責戰鬥決策和高級策略。
 *    - Input: 32維向量 (8方向牆壁距離 + 8方向敵人距離 + 自身狀態)
 *    - Output: 戰術動作 (攻擊模式、Dash時機、激進/保守切換)
 * 
 * 訓練模式：
 * 機器人會在遊戲過程中實時收集數據並進行訓練 (Experience Replay)。
 * 利用 M4 的 WebGL 加速進行後台訓練。
 */

class M4NeuralBot {
    constructor() {
        this.enabled = false;
        this.debugMode = false;
        this.useTF = true;
        // A freshly-created model has random weights and is not safe to use as a
        // live policy. Keep TF available for the training harness, while the
        // game bot uses the deterministic survival controller below.
        this.useNeuralPolicy = false;
        
        // 傳統算法配置
        this.config = {
            gridSize: 28,
            weights: {
                wall: 999999,
                futureWall: 50000,
                enemy: 5000,
                corner: 2000,
                optimalRange: -100
            }
        };
        
        // TF.js 配置
        this.model = null;
        this.isTraining = false;
        this.replayBuffer = [];
        this.maxReplaySize = 10000;
        this.batchSize = 32;
        this.epsilon = 0.1; // 探索率
        
        this.path = [];
        this.targetSpot = null;
        this.wanderAngle = 0;
        this.currentStrategy = 0;
        this.moveVector = { x: 0, y: -1 };
        this.steeringIndex = 6;
        this.steeringHoldFrames = 0;
        this.steeringChanges = 0;
        this.lastPosition = null;
        this.stuckFrames = 0;
        this.positionHistory = [];
        this.escapeFrames = 0;
        this.escapeCooldownFrames = 0;
        this.escapeVector = { x: 0, y: -1 };
        this.escapeReason = 'none';
        this.escapeEvents = 0;
        this.dashCount = 0;
        this.lastDashFrame = -999;
        this.lastDashedEscapeEvent = 0;
        this.lastDashReason = 'none';
        this.dashReasons = { threat: 0, terrain: 0, edge: 0, breakout: 0, stuck: 0, travel: 0 };
        this.movementKeyChanges = 0;
        this.movementReversals = 0;
        this.lastMovementMask = '';
        this.horizontalSwitchDelay = 0;
        this.verticalSwitchDelay = 0;
        this.survivalFrames = 0;
        this.autoRestart = false;
        this.restartTimer = null;
        
        this.init();
    }
    
    async init() {
        this.createUI();
        
        // 初始化 TensorFlow 模型
        if (typeof tf !== 'undefined') {
            await this.initModel();
            console.log('[M4 CORE] TensorFlow.js Model Loaded on WebGL Backend');
        } else {
            console.warn('[M4 CORE] TensorFlow.js not found!');
            this.useTF = false;
        }
        
        this.startLoop();
        
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyB') this.toggle();
            if (e.code === 'KeyV') this.debugMode = !this.debugMode;
            if (e.code === 'KeyT') this.toggleTraining();
            if (e.code === 'KeyR') this.toggleAutoRestart();
        });
    }
    
    toggleAutoRestart() {
        this.autoRestart = !this.autoRestart;
        const status = this.autoRestart ? "ON" : "OFF";
        console.log(`[M4 CORE] Auto Restart: ${status}`);
        // Optional: Add visual feedback
        const restartStatus = document.getElementById('restart-status');
        if (restartStatus) restartStatus.innerText = `AUTO-RESTART: ${status}`;
        else {
            // Create if not exists (Quick hack to add to UI)
            const div = document.createElement('div');
            div.id = 'restart-status';
            div.style.cssText = "font-size:10px;color:#aaa;margin-top:5px;";
            div.innerText = `AUTO-RESTART: ${status}`;
            this.uiStatus.parentElement.appendChild(div);
        }
    }
    
    async initModel() {
        // 簡單的 DQN 模型
        this.model = tf.sequential();
        this.model.add(tf.layers.dense({units: 64, activation: 'relu', inputShape: [20]})); // 20 inputs
        this.model.add(tf.layers.dense({units: 64, activation: 'relu'}));
        this.model.add(tf.layers.dense({units: 4, activation: 'softmax'})); // 4 outputs: Aggressive, Defensive, Evasive, Camping
        
        this.model.compile({optimizer: 'adam', loss: 'categoricalCrossentropy'});
        
        this.uiStatus.innerText = "TF.js READY";
    }
    
    createUI() {
        const ui = document.createElement('div');
        ui.style.cssText = `position:fixed;top:20px;right:20px;background:rgba(0,0,0,0.9);border:1px solid #0ff;padding:15px;color:#0ff;font-family:monospace;z-index:9999;pointer-events:none;box-shadow:0 0 20px rgba(0,255,255,0.2);`;
        ui.innerHTML = `
            <div style="font-weight:bold;border-bottom:1px solid #0ff;margin-bottom:5px;"> M4 SURVIVAL CORE v5.2</div>
            <div id="m4-status">STANDBY</div>
            <div id="m4-mode" style="color:#ff0;font-size:11px;">MODE: SURVIVAL</div>
            <div id="m4-perf" style="font-size:10px;color:#888;margin-top:5px;"></div>
            <div id="tf-stats" style="font-size:10px;color:#aaa;margin-top:5px;display:none;">
                Tensors: <span id="tensor-count">0</span><br>
                Loss: <span id="loss-val">0.00</span>
            </div>
        `;
        document.body.appendChild(ui);
        this.uiStatus = document.getElementById('m4-status');
        this.uiPerf = document.getElementById('m4-perf');
        this.uiMode = document.getElementById('m4-mode');
        this.uiTfStats = document.getElementById('tf-stats');
    }
    
    toggle() {
        this.enabled = !this.enabled;
        this.uiStatus.innerText = this.enabled ? "ONLINE" : "STANDBY";
        this.uiStatus.style.color = this.enabled ? "#0f0" : "#f0f";
        if(!this.enabled) this.clearKeys();
    }
    
    toggleTraining() {
        this.isTraining = !this.isTraining;
        this.uiTfStats.style.display = this.isTraining ? 'block' : 'none';
        console.log(`[M4 CORE] Training: ${this.isTraining}`);
    }
    
    clearKeys() {
        ['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].forEach(k => keys[k] = false);
    }
    
    startLoop() {
        const originalDraw = window.draw;
        window.draw = () => {
            originalDraw();
            
            // Auto Restart Logic
            if (isGameOver && this.autoRestart) {
                if (!this.restartTimer) {
                    this.restartTimer = setTimeout(() => {
                        resetGame();
                        this.restartTimer = null;
                    }, 1500); // 1.5s delay
                }
            }

            if (this.enabled && !isGameOver) {
                const t0 = performance.now();
                this.update();
                const t1 = performance.now();
                if (this.frameCount % 10 === 0) {
                    this.uiPerf.innerText = `Compute: ${(t1-t0).toFixed(2)}ms`;
                    if (this.useTF) {
                        document.getElementById('tensor-count').innerText = tf.memory().numTensors;
                    }
                }
            }
        };
    }
    
    update() {
        this.frameCount = (this.frameCount || 0) + 1;
        this.survivalFrames++;

        // --- PER-FRAME CACHE ---
        // Build once, reuse in getEnvironmentState / executeMovement / checkDash / trainModel
        // Avoids iterating the enemies array 4-6 times per frame.
        this._enemyCache = enemies.map(e => {
            const dx = e.x - player.x;
            const dy = e.y - player.y;
            return { e, dx, dy, dist: Math.hypot(dx, dy) };
        }).sort((a, b) => a.dist - b.dist);
        this._nearestEnemy = this._enemyCache[0] || null;

        // 1. 感知環境 (Perception)
        const state = this.getEnvironmentState();
        
        // 2. Survival decision. The neural policy is opt-in only after a model
        // has actually been trained/imported; random logits are not a policy.
        let strategy = this.selectStrategy(state);
        if (this.useNeuralPolicy && this.useTF && this.model) {
            tf.tidy(() => {
                const input = tf.tensor2d([state], [1, 20]);
                const prediction = this.model.predict(input);
                strategy = prediction.argMax(1).dataSync()[0];
            });
        }
        this.currentStrategy = strategy;
        
        // 更新 UI 顯示當前策略
        const strategies = ['BALANCED', 'PRESSURE', 'EVASIVE', 'RECOVER'];
        if (this.frameCount % 10 === 0) {
            const breakout = this.escapeFrames > 0 ? ' / BREAKOUT' : '';
            this.uiMode.innerText = `STRATEGY: ${strategies[strategy]}${breakout}`;
        }
        
        // 3. 根據策略調整權重 (Dynamic Weights)
        this.adjustWeights(strategy);

        // 4. 執行 A* 導航 (Navigation) — throttled
        // Re-scan terrain every 15 frames; re-path every 20 frames or when target moves >40px.
        if (this.frameCount % 15 === 0 || !this.targetSpot) {
            const bestSpot = this.analyzeTerrainAndFindSafeSpot();
            if (bestSpot) {
                const prevTarget = this.targetSpot;
                const targetMoved = !prevTarget || Math.hypot(bestSpot.x - prevTarget.x, bestSpot.y - prevTarget.y) > 40;
                this.targetSpot = bestSpot;
                if (targetMoved) {
                    this.path = this.findPath(player.x, player.y, bestSpot.x, bestSpot.y);
                }
            }
        } else if (this.targetSpot && this.frameCount % 20 === 0) {
            // Refresh path periodically even with stable target (handles dynamic walls)
            this.path = this.findPath(player.x, player.y, this.targetSpot.x, this.targetSpot.y);
        }
        this.executeMovement();
        
        // 5. 戰鬥 (Combat)
        this.executeCombat(strategy);
        
        // 5.5 Dash Logic
        this.checkDash();
        
        // 6. 訓練 (Training Loop)
        if (this.isTraining) {
            this.trainModel(state, strategy);
        }
        
        if (this.debugMode) this.drawDebug();
    }

    selectStrategy() {
        const nearest = this._nearestEnemy ? this._nearestEnemy.dist : Infinity;
        const edgeClearance = Math.min(player.x, player.y, width - player.x, height - player.y);
        let nearby = 0;
        for (const item of this._enemyCache || []) {
            if (item.dist < 180) nearby++;
            else break;
        }

        if (player.hp < 55 || edgeClearance < 70) return 3; // recover: maximize space and avoid all trades
        if (edgeClearance < 140) return 2;
        if (nearest < 125 || nearby >= 3) return 2; // immediate danger
        if (player.hp > 80 && nearby <= 1 && nearest > 260 && nearest < 520) return 1;
        return 0;
    }
    
    getEnvironmentState() {
        // 構建 20維 狀態向量
        // [0-7]: 8方向牆壁距離  [8-15]: 8方向敵人距離
        // [16]: Dash CD  [17]: 最近敵人距離  [18]: 敵人數量  [19]: Wave

        const sensors = [];
        const dirs = [[1,0], [0.7,0.7], [0,1], [-0.7,0.7], [-1,0], [-0.7,-0.7], [0,-1], [0.7,-0.7]];

        // Wall Sensors
        for (let d = 0; d < dirs.length; d++) {
            const dir = dirs[d];
            let dist = 0;
            for (let i = 10; i < 300; i += 20) {
                if (isWall(player.x + dir[0]*i, player.y + dir[1]*i)) { dist = i; break; }
            }
            sensors.push(dist / 300);
        }

        // Enemy Sensors — reuse per-frame cache (avoids re-computing hypot)
        const cache = this._enemyCache || [];
        for (let d = 0; d < dirs.length; d++) {
            const dir = dirs[d];
            let minDist = 1.0;
            for (let ci = 0; ci < cache.length; ci++) {
                const { dx, dy, dist } = cache[ci];
                if (dist === 0) continue;
                const invDist = 1 / dist;
                const dot = (dx * invDist) * dir[0] + (dy * invDist) * dir[1];
                if (dot > 0.8) {
                    const nd = dist / 500;
                    if (nd < minDist) minDist = nd;
                }
            }
            sensors.push(minDist);
        }

        sensors.push(player.dashCooldown / 60);
        sensors.push(Math.min(1, (this._nearestEnemy ? this._nearestEnemy.dist : Infinity) / 500));
        sensors.push(Math.min(1, enemies.length / 20));
        sensors.push(Math.min(1, wave / 10));

        return sensors;
    }
    
    adjustWeights(strategy) {
        const w = this.config.weights;
        // Reset every field first. v4 leaked values between strategies, so one
        // aggressive/camping frame could poison navigation for the whole run.
        w.wall = 999999;
        w.futureWall = 60000;
        w.enemy = 6500;
        w.corner = 3000;
        w.optimalRange = -100;
        switch(strategy) {
            case 1: // PRESSURE: engage, but never ignore hazards
                w.enemy = 4500;
                w.optimalRange = -400;
                break;
            case 2: // EVASIVE
                w.enemy = 11000;
                w.futureWall = 90000;
                break;
            case 3: // RECOVER
                w.enemy = 15000;
                w.futureWall = 110000;
                w.corner = 6000;
                break;
            default:
                break;
        }
    }
    
    async trainModel(state, action) {
        // Shaped reward: survival + proximity danger penalty
        // Closer enemies → negative signal; being alive → small positive
        const nearestDist = this._nearestEnemy ? this._nearestEnemy.dist : Infinity;
        const dangerPenalty = nearestDist < 150 ? -0.15 * (1 - nearestDist / 150) : 0;
        const reward = 0.1 + dangerPenalty;

        this.replayBuffer.push({state, action, reward});
        if (this.replayBuffer.length > this.maxReplaySize) this.replayBuffer.shift();
        
        if (this.replayBuffer.length > this.batchSize && this.frameCount % 60 === 0) {
            // 隨機採樣訓練
            const batch = [];
            for(let i=0; i<this.batchSize; i++) {
                batch.push(this.replayBuffer[Math.floor(Math.random() * this.replayBuffer.length)]);
            }
            
            const xs = tf.tensor2d(batch.map(b => b.state));
            // 這裡應該是 Q-Learning 的 target 計算，這裡簡化為 Policy Gradient 風格
            // 實際上我們只是讓它"模仿"當前的行為並強化它
            const ys = tf.tensor2d(batch.map(b => {
                const y = [0,0,0,0];
                y[b.action] = 1; // One-hot
                return y;
            }));
            
            const h = await this.model.fit(xs, ys, {epochs: 1, verbose: 0});
            document.getElementById('loss-val').innerText = h.history.loss[0].toFixed(4);
            
            xs.dispose();
            ys.dispose();
        }
    }
    
    // --- 以下保留 A* 和 戰鬥邏輯 ---
    
    analyzeTerrainAndFindSafeSpot() {
        const gridW = Math.ceil(width / this.config.gridSize);
        const gridH = Math.ceil(height / this.config.gridSize);
        let minScore = Infinity;
        let bestPoint = null;
        const clearanceDirs = [[1,0],[0.7,0.7],[0,1],[-0.7,0.7],[-1,0],[-0.7,-0.7],[0,-1],[0.7,-0.7]];
        
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                const wx = x * this.config.gridSize + this.config.gridSize/2;
                const wy = y * this.config.gridSize + this.config.gridSize/2;
                
                if (isWall(wx, wy) || this.isWallAtTime(wx, wy, gameTime + 0.8)) continue;

                let score = Math.hypot(player.x - wx, player.y - wy) * 0.7;
                let openSamples = 0;
                for (const dir of clearanceDirs) {
                    for (const radius of [24, 46]) {
                        const cx = wx + dir[0] * radius;
                        const cy = wy + dir[1] * radius;
                        if (isWall(cx, cy)) score += this.config.weights.wall * 0.035;
                        else openSamples++;
                        if (this.isWallAtTime(cx, cy, gameTime + 1.4)) {
                            score += this.config.weights.futureWall * 0.12;
                        }
                    }
                }
                score -= openSamples * 350;

                // Avoid edges/corners where a moving terrain pocket can trap us.
                const edgeClearance = Math.min(wx, wy, width - wx, height - wy);
                if (edgeClearance < 75) continue;
                if (edgeClearance < 200) {
                    const edgeDanger = 1 - edgeClearance / 200;
                    score += 22000 * edgeDanger * edgeDanger;
                }

                let distToNearestEnemy = Infinity;
                for (let e of enemies) {
                    const d = Math.hypot(e.x - wx, e.y - wy);
                    if (d < distToNearestEnemy) distToNearestEnemy = d;
                    const dangerRadius = e.type === 'ice_dust' ? 340 : 280;
                    if (d < dangerRadius) {
                        const danger = 1 - d / dangerRadius;
                        score += this.config.weights.enemy * danger * danger;
                    }
                }
                
                if (distToNearestEnemy > 200 && distToNearestEnemy < 400) score += this.config.weights.optimalRange;
                
                if (score < minScore) { minScore = score; bestPoint = { x: wx, y: wy }; }
            }
        }
        return bestPoint;
    }
    
    findPath(startX, startY, endX, endY) {
        const cellSize = 40;
        const startNode = { x: Math.floor(startX/cellSize), y: Math.floor(startY/cellSize), g:0, h:0, f:0, parent:null };
        const endNode   = { x: Math.floor(endX/cellSize),   y: Math.floor(endY/cellSize) };

        let openList = [startNode];
        // O(1) open-list lookup by key — eliminates the O(n) openList.find() hotspot
        const openMap  = new Map();
        openMap.set(`${startNode.x},${startNode.y}`, startNode);
        const closedSet = new Set();
        let iterations = 0;

        const dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
        const nodeR = 15;

        while (openList.length > 0 && iterations < 200) {
            iterations++;

            // Find min-F node
            let lowInd = 0;
            for (let i = 1; i < openList.length; i++) if (openList[i].f < openList[lowInd].f) lowInd = i;
            const currentNode = openList[lowInd];

            if (Math.abs(currentNode.x - endNode.x) <= 1 && Math.abs(currentNode.y - endNode.y) <= 1) {
                let curr = currentNode;
                const ret = [];
                while (curr.parent) { ret.push({x: curr.x*cellSize+cellSize/2, y: curr.y*cellSize+cellSize/2}); curr = curr.parent; }
                return ret.reverse();
            }

            openList.splice(lowInd, 1);
            const currKey = `${currentNode.x},${currentNode.y}`;
            openMap.delete(currKey);
            closedSet.add(currKey);

            for (let i = 0; i < dirs.length; i++) {
                const nx = currentNode.x + dirs[i][0];
                const ny = currentNode.y + dirs[i][1];
                const key = `${nx},${ny}`;
                if (closedSet.has(key)) continue;

                const wx = nx*cellSize + cellSize/2;
                const wy = ny*cellSize + cellSize/2;
                if (isWall(wx, wy)) continue;
                if (isWall(wx+nodeR, wy) || isWall(wx-nodeR, wy) || isWall(wx, wy+nodeR) || isWall(wx, wy-nodeR)) continue;
                if (this.isWallAtTime(wx, wy, gameTime + 0.5)) continue;

                const gScore = currentNode.g + 1;
                let neighbor = openMap.get(key);

                if (!neighbor) {
                    neighbor = { x: nx, y: ny, g: gScore, h: Math.abs(nx - endNode.x) + Math.abs(ny - endNode.y), f: 0, parent: currentNode };
                    neighbor.f = neighbor.g + neighbor.h;
                    openList.push(neighbor);
                    openMap.set(key, neighbor);
                } else if (gScore < neighbor.g) {
                    neighbor.parent = currentNode;
                    neighbor.g = gScore;
                    neighbor.f = neighbor.g + neighbor.h;
                }
            }
        }
        return [];
    }
    
    executeMovement() {
        // Pick a navigation target, then locally score directions against the
        // moving terrain and nearby enemies. This keeps the path planner from
        // blindly walking into a hazard that appeared after the last re-path.
        let targetX = player.x;
        let targetY = player.y;
        
        if (this.path.length > 0) {
            const nextNode = this.path[0];
            // Smooth path consumption: Don't wait to reach exactly, flow through points
            if (Math.hypot(nextNode.x - player.x, nextNode.y - player.y) < 30) this.path.shift();
            if (this.path.length > 0) { targetX = this.path[0].x; targetY = this.path[0].y; }
        } else if (this.targetSpot) { 
            targetX = this.targetSpot.x; 
            targetY = this.targetSpot.y; 
        }

        this.updateEscapeState(targetX, targetY);

        let dx = targetX - player.x;
        let dy = targetY - player.y;
        if (this.escapeFrames > 0) {
            dx = this.escapeVector.x * 5;
            dy = this.escapeVector.y * 5;
        }
        let len = Math.hypot(dx, dy);
        if (len > 0) { dx /= len; dy /= len; }
        else { dx = this.moveVector.x; dy = this.moveVector.y; }

        // Strong continuous repulsion, weighted by speed and proximity.
        for (const item of this._enemyCache || []) {
            if (item.dist > 320) break;
            if (item.dist < 1) continue;
            const danger = 1 - item.dist / 320;
            const multiplier = (item.e.type === 'ice_dust' ? 4.2 : 3.0) * danger * danger;
            dx -= (item.dx / item.dist) * multiplier;
            dy -= (item.dy / item.dist) * multiplier;
        }

        // The game has no useful cover at the outer boundary. Bias inward well
        // before contact so enemy knockback cannot pin the bot outside the map.
        const edgeBuffer = 180;
        if (player.x < edgeBuffer) dx += (1 - player.x / edgeBuffer) * 6;
        if (player.x > width - edgeBuffer) dx -= (1 - (width - player.x) / edgeBuffer) * 6;
        if (player.y < edgeBuffer) dy += (1 - player.y / edgeBuffer) * 6;
        if (player.y > height - edgeBuffer) dy -= (1 - (height - player.y) / edgeBuffer) * 6;

        const chosen = this.findBestMoveDirection(dx, dy);
        this.moveVector = chosen;
        this.applyMovementKeys(chosen);

        if (this.lastPosition) {
            const moved = Math.hypot(player.x - this.lastPosition.x, player.y - this.lastPosition.y);
            this.stuckFrames = moved < 1.1 ? this.stuckFrames + 1 : Math.max(0, this.stuckFrames - 2);
        }
        this.lastPosition = { x: player.x, y: player.y };
    }

    updateEscapeState(targetX, targetY) {
        if (this.escapeFrames > 0) {
            this.escapeFrames--;
            this.positionHistory.length = 0;
            if (this.escapeFrames === 0) this.escapeCooldownFrames = 90;
            return;
        }
        if (this.escapeCooldownFrames > 0) this.escapeCooldownFrames--;

        if (this.frameCount % 5 === 0) {
            this.positionHistory.push({ x: player.x, y: player.y });
            if (this.positionHistory.length > 12) this.positionHistory.shift();
        }

        if (this.escapeCooldownFrames > 0 || this.positionHistory.length < 10) return;
        const oldest = this.positionHistory[0];
        const progress = Math.hypot(player.x - oldest.x, player.y - oldest.y);
        const targetDistance = Math.hypot(targetX - player.x, targetY - player.y);
        const blocked = isWall(player.x + this.moveVector.x * 28, player.y + this.moveVector.y * 28);
        const noProgress = targetDistance > 120 && progress < 24;

        const hardStuck = this.stuckFrames > 14;
        const blockedStuck = blocked && progress < 35;
        if (hardStuck || noProgress || blockedStuck) {
            this.escapeReason = hardStuck ? 'stuck' : (blockedStuck ? 'blocked' : 'no_progress');
            this.escapeVector = this.findEscapeDirection(targetX - player.x, targetY - player.y);
            this.escapeFrames = 48;
            this.escapeEvents++;
            this.steeringHoldFrames = 0;
            this.positionHistory.length = 0;
        }
    }

    findEscapeDirection(preferredX, preferredY) {
        const preferredLen = Math.hypot(preferredX, preferredY) || 1;
        preferredX /= preferredLen;
        preferredY /= preferredLen;
        let best = this.moveVector;
        let bestScore = Infinity;

        for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI * 2 / 8;
            const vx = Math.cos(angle);
            const vy = Math.sin(angle);
            const landX = player.x + vx * player.dashSpeed * 8;
            const landY = player.y + vy * player.dashSpeed * 8;
            let score = -(vx * preferredX + vy * preferredY) * 250;
            let landingBlocked = false;

            for (const offset of [[0,0],[14,0],[-14,0],[0,14],[0,-14]]) {
                const x = landX + offset[0];
                const y = landY + offset[1];
                if (isWall(x, y) || this.isWallAtTime(x, y, gameTime + 0.8)) {
                    landingBlocked = true;
                    break;
                }
            }
            if (landingBlocked) continue;

            // Prefer a roomy landing pocket; intermediate walls are allowed
            // because the dash mechanic intentionally crosses thin terrain.
            for (let j = 0; j < 8; j++) {
                const a = j * Math.PI * 2 / 8;
                for (const radius of [28, 52]) {
                    const x = landX + Math.cos(a) * radius;
                    const y = landY + Math.sin(a) * radius;
                    if (isWall(x, y) || this.isWallAtTime(x, y, gameTime + 1.0)) score += 650;
                    else score -= 180;
                }
            }

            const edgeClearance = Math.min(landX, landY, width - landX, height - landY);
            if (edgeClearance < 130) score += (130 - edgeClearance) * 80;
            for (const item of this._enemyCache || []) {
                const d = Math.hypot(item.e.x - landX, item.e.y - landY);
                if (d < 190) score += (190 - d) * (item.e.type === 'ice_dust' ? 55 : 35);
            }

            if (score < bestScore) {
                bestScore = score;
                best = { x: vx, y: vy };
            }
        }
        return best;
    }

    findBestMoveDirection(preferredX, preferredY) {
        const preferredLen = Math.hypot(preferredX, preferredY) || 1;
        preferredX /= preferredLen;
        preferredY /= preferredLen;
        const candidates = [];

        for (let i = 0; i < 8; i++) {
            const angle = i * Math.PI * 2 / 8;
            const vx = Math.cos(angle);
            const vy = Math.sin(angle);
            let score = -(vx * preferredX + vy * preferredY) * 900;
            score -= (vx * this.moveVector.x + vy * this.moveVector.y) * 120;

            for (const probe of [22, 46, 82]) {
                const px = player.x + vx * probe;
                const py = player.y + vy * probe;
                if (isWall(px, py)) score += 16000 * (90 - probe) / 68;
                if (this.isWallAtTime(px, py, gameTime + 0.65)) score += 8500 * (90 - probe) / 68;
            }

            const sampleX = player.x + vx * 60;
            const sampleY = player.y + vy * 60;
            const edgeClearance = Math.min(sampleX, sampleY, width - sampleX, height - sampleY);
            if (edgeClearance < 140) {
                const edgeDanger = Math.max(0, 140 - edgeClearance);
                score += edgeDanger * edgeDanger * 2.5;
            }
            for (const item of this._enemyCache || []) {
                if (item.dist > 380) break;
                const d = Math.hypot(item.e.x - sampleX, item.e.y - sampleY);
                if (d < 220) {
                    const danger = 1 - d / 220;
                    score += (item.e.type === 'ice_dust' ? 7000 : 4500) * danger * danger;
                }
            }

            candidates.push({ index: i, x: vx, y: vy, score });
        }

        candidates.sort((a, b) => a.score - b.score);
        const rawBest = candidates[0];
        const current = candidates.find(c => c.index === this.steeringIndex) || rawBest;
        const improvement = current.score - rawBest.score;
        const immediateX = player.x + current.x * 22;
        const immediateY = player.y + current.y * 22;
        const emergencyTurn = isWall(immediateX, immediateY) || this.isWallAtTime(immediateX, immediateY, gameTime + 0.35);
        let chosen = rawBest;

        // Direction hysteresis: keep the current lane through small score
        // fluctuations. Only a materially safer route may break the lock.
        if (!emergencyTurn && this.steeringHoldFrames > 0) {
            chosen = current;
            this.steeringHoldFrames--;
        } else if (!emergencyTurn && rawBest.index !== this.steeringIndex && improvement < 1050) {
            chosen = current;
            this.steeringHoldFrames = Math.max(0, this.steeringHoldFrames - 1);
        } else if (rawBest.index !== this.steeringIndex) {
            this.steeringIndex = rawBest.index;
            this.steeringHoldFrames = this.escapeFrames > 0 ? 22 : 18;
            this.steeringChanges++;
        }

        // Low-pass steering removes single-frame angle jumps. Breakout and
        // emergency avoidance react faster, normal travel stays deliberately smooth.
        const alpha = emergencyTurn ? 0.78 : (this.escapeFrames > 0 ? 0.55 : 0.20);
        let x = this.moveVector.x * (1 - alpha) + chosen.x * alpha;
        let y = this.moveVector.y * (1 - alpha) + chosen.y * alpha;
        const len = Math.hypot(x, y) || 1;
        return { x: x / len, y: y / len };
    }

    applyMovementKeys(vector, forceTurn = false) {
        const engage = 0.42;
        const release = 0.22;
        const wasA = !!keys['KeyA'];
        const wasD = !!keys['KeyD'];
        const wasW = !!keys['KeyW'];
        const wasS = !!keys['KeyS'];

        if (vector.x < -engage) {
            keys['KeyA'] = true; keys['KeyD'] = false;
        } else if (vector.x > engage) {
            keys['KeyD'] = true; keys['KeyA'] = false;
        } else {
            if (keys['KeyA'] && vector.x > -release) keys['KeyA'] = false;
            if (keys['KeyD'] && vector.x < release) keys['KeyD'] = false;
        }

        if (vector.y < -engage) {
            keys['KeyW'] = true; keys['KeyS'] = false;
        } else if (vector.y > engage) {
            keys['KeyS'] = true; keys['KeyW'] = false;
        } else {
            if (keys['KeyW'] && vector.y > -release) keys['KeyW'] = false;
            if (keys['KeyS'] && vector.y < release) keys['KeyS'] = false;
        }

        // Reversing an axis in one frame is the most visible form of jitter.
        // Insert a tiny neutral window for normal steering; intentional escape
        // dashes can still force an immediate turn.
        const horizontalFlipRequested = (wasA && keys['KeyD']) || (wasD && keys['KeyA']);
        const verticalFlipRequested = (wasW && keys['KeyS']) || (wasS && keys['KeyW']);
        if (!forceTurn && horizontalFlipRequested) {
            keys['KeyA'] = false; keys['KeyD'] = false;
            this.horizontalSwitchDelay = 3;
        } else if (!forceTurn && this.horizontalSwitchDelay > 0) {
            keys['KeyA'] = false; keys['KeyD'] = false;
            this.horizontalSwitchDelay--;
        }
        if (!forceTurn && verticalFlipRequested) {
            keys['KeyW'] = false; keys['KeyS'] = false;
            this.verticalSwitchDelay = 3;
        } else if (!forceTurn && this.verticalSwitchDelay > 0) {
            keys['KeyW'] = false; keys['KeyS'] = false;
            this.verticalSwitchDelay--;
        }

        const mask = `${keys['KeyW'] ? 'W' : ''}${keys['KeyA'] ? 'A' : ''}${keys['KeyS'] ? 'S' : ''}${keys['KeyD'] ? 'D' : ''}`;
        if (this.lastMovementMask && mask !== this.lastMovementMask) {
            this.movementKeyChanges++;
            const horizontalFlip = (this.lastMovementMask.includes('A') && mask.includes('D')) || (this.lastMovementMask.includes('D') && mask.includes('A'));
            const verticalFlip = (this.lastMovementMask.includes('W') && mask.includes('S')) || (this.lastMovementMask.includes('S') && mask.includes('W'));
            if (horizontalFlip || verticalFlip) this.movementReversals++;
        }
        this.lastMovementMask = mask;
    }
    
    executeCombat(strategy) {
        keys['ArrowUp'] = false; keys['ArrowDown'] = false; keys['ArrowLeft'] = false; keys['ArrowRight'] = false;
        if (enemies.length === 0) return;
        
        let bestTarget = null;
        let minScore = Infinity;
        
        enemies.forEach(e => {
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            if (!this.hasLineOfSight(player.x, player.y, e.x, e.y)) return;
            
            // Prefer immediate threats while still finishing weak targets.
            let score = dist + (e.hp * 10);
            if (e.type === 'ice_dust') score -= 80;
            if (strategy === 1) score = dist + (e.hp * 5);
            if (score < minScore) { minScore = score; bestTarget = e; }
        });
        
        if (bestTarget) {
            // AIMING V2: 增強型預判與鎖定
            const bulletSpeed = 12;
            const dist = Math.hypot(bestTarget.x - player.x, bestTarget.y - player.y);
            const timeToHit = dist / bulletSpeed;
            
            // 預測敵人未來位置
            const ex = bestTarget.x; const ey = bestTarget.y;
            const edx = player.x - ex; const edy = player.y - ey; // 敵人是朝玩家走來的 (簡單AI假設)
            const elen = Math.sqrt(edx*edx + edy*edy);
            
            // 如果敵人距離很近，直接打現在位置，不要預判 (防止預判過頭)
            let targetX, targetY;
            if (dist < 100) {
                targetX = ex;
                targetY = ey;
            } else {
                const eSpeed = bestTarget.speed;
                const safeLen = elen || 1;
                targetX = ex + (edx/safeLen) * eSpeed * timeToHit;
                targetY = ey + (edy/safeLen) * eSpeed * timeToHit;
            }
            
            const angle = Math.atan2(targetY - player.y, targetX - player.x);
            
            // 轉換為 8 方向射擊 (更精確的扇區劃分)
            // 0: Right, 1: Down-Right, 2: Down ...
            // 使用 22.5 度偏移來確保扇區中心對齊
            const deg = angle * (180 / Math.PI);
            const sector = Math.floor((deg + 22.5 + 180) / 45); 
            // sector 0 = Left (-180+22.5 ~ -135+22.5) -> 實際上是 Left
            // Mapping:
            // 0: Left (-180)
            // 1: Up-Left (-135)
            // 2: Up (-90)
            // 3: Up-Right (-45)
            // 4: Right (0)
            // 5: Down-Right (45)
            // 6: Down (90)
            // 7: Down-Left (135)
            
            switch (sector % 8) {
                case 0: keys['ArrowLeft'] = true; break;
                case 1: keys['ArrowLeft'] = true; keys['ArrowUp'] = true; break;
                case 2: keys['ArrowUp'] = true; break;
                case 3: keys['ArrowRight'] = true; keys['ArrowUp'] = true; break;
                case 4: keys['ArrowRight'] = true; break;
                case 5: keys['ArrowRight'] = true; keys['ArrowDown'] = true; break;
                case 6: keys['ArrowDown'] = true; break;
                case 7: keys['ArrowLeft'] = true; keys['ArrowDown'] = true; break;
            }
        }
    }
    
    checkDash() {
        if (player.dashCooldown > 0) return;

        // Every dash needs an explicit reason. Emergency reasons are immediate;
        // travel dashes have a long interval and must save meaningful distance.
        let nearbyEnemies = 0;
        let escapeX = 0, escapeY = 0;
        const ec = this._enemyCache || [];
        for (let i = 0; i < ec.length; i++) {
            if (ec[i].dist >= 145) break;
            nearbyEnemies++;
            const safeDist = ec[i].dist || 1;
            escapeX -= ec[i].dx / safeDist;
            escapeY -= ec[i].dy / safeDist;
        }
        const nearestDanger = this._nearestEnemy && this._nearestEnemy.dist < (this._nearestEnemy.e.type === 'ice_dust' ? 140 : 105);
        const terrainClosing = this.isWallAtTime(player.x, player.y, gameTime + 0.45);
        const blockedAhead = isWall(player.x + this.moveVector.x * 26, player.y + this.moveVector.y * 26);
        const edgeClearance = Math.min(player.x, player.y, width - player.x, height - player.y);
        const edgeDanger = edgeClearance < 90;
        const sinceLastDash = this.frameCount - this.lastDashFrame;
        const routeDistance = this.targetSpot ? Math.hypot(this.targetSpot.x - player.x, this.targetSpot.y - player.y) : 0;
        const nearestDistance = this._nearestEnemy ? this._nearestEnemy.dist : Infinity;
        const criticalThreat = this._nearestEnemy && this._nearestEnemy.dist < (this._nearestEnemy.e.type === 'ice_dust' ? 75 : 55);
        const threatDash = (nearestDanger || nearbyEnemies >= 2) && (criticalThreat || nearbyEnemies >= 4 || sinceLastDash > 120);
        const edgeDash = edgeDanger && (edgeClearance < 35 || sinceLastDash > 130);
        const terrainDash = terrainClosing && (isWall(player.x, player.y) || sinceLastDash > 90);
        const stuckDanger = ((blockedAhead && this.stuckFrames > 5) || this.stuckFrames > 12) && sinceLastDash > 130;
        const breakoutDash = this.escapeFrames > 0 && this.escapeReason !== 'no_progress' && this.lastDashedEscapeEvent !== this.escapeEvents;
        const travelDash = (routeDistance > 300 || this.path.length > 5) && nearestDistance > 240 && sinceLastDash > 300;

        let reason = null;
        if (edgeDash) reason = 'edge';
        else if (terrainDash) reason = 'terrain';
        else if (threatDash) reason = 'threat';
        else if (breakoutDash) reason = 'breakout';
        else if (stuckDanger) reason = 'stuck';
        else if (travelDash) reason = 'travel';
        if (!reason) return;

        if (reason === 'edge') {
            escapeX = width / 2 - player.x;
            escapeY = height / 2 - player.y;
        } else if (reason === 'breakout') {
            escapeX = this.escapeVector.x;
            escapeY = this.escapeVector.y;
        } else if (nearbyEnemies === 0) {
            escapeX = this.moveVector.x;
            escapeY = this.moveVector.y;
        } else {
            escapeX += this.moveVector.x * 0.5;
            escapeY += this.moveVector.y * 0.5;
        }

        const dash = this.findSafeDashDirection(escapeX, escapeY);
        if (!dash) return;

        if (reason === 'travel' && this.targetSpot) {
            const dashDistance = player.dashSpeed * 8;
            const landingDistance = Math.hypot(
                this.targetSpot.x - (player.x + dash.x * dashDistance),
                this.targetSpot.y - (player.y + dash.y * dashDistance)
            );
            if (routeDistance - landingDistance < 70) return;
        }

        this.moveVector = dash;
        this.steeringIndex = Math.round((Math.atan2(dash.y, dash.x) + Math.PI * 2) / (Math.PI * 2 / 8)) % 8;
        this.steeringHoldFrames = 16;
        this.applyMovementKeys(dash, true);
        tryDash();
        this.dashCount++;
        this.dashReasons[reason]++;
        this.lastDashReason = reason;
        if (reason === 'breakout') this.lastDashedEscapeEvent = this.escapeEvents;
        this.lastDashFrame = this.frameCount;
        this.stuckFrames = 0;
    }

    findSafeDashDirection(preferredX, preferredY) {
        const preferredLen = Math.hypot(preferredX, preferredY) || 1;
        preferredX /= preferredLen;
        preferredY /= preferredLen;
        const dashDistance = player.dashSpeed * 8;
        let best = null;
        let bestScore = Infinity;

        for (let i = 0; i < 16; i++) {
            const angle = i * Math.PI * 2 / 16;
            const vx = Math.cos(angle);
            const vy = Math.sin(angle);
            const landX = player.x + vx * dashDistance;
            const landY = player.y + vy * dashDistance;
            let unsafe = false;

            for (const offset of [[0,0],[14,0],[-14,0],[0,14],[0,-14]]) {
                const x = landX + offset[0];
                const y = landY + offset[1];
                if (isWall(x, y) || this.isWallAtTime(x, y, gameTime + 0.8)) {
                    unsafe = true;
                    break;
                }
            }
            if (unsafe) continue;

            let score = -(vx * preferredX + vy * preferredY) * 1000;
            for (const item of this._enemyCache || []) {
                const d = Math.hypot(item.e.x - landX, item.e.y - landY);
                if (d < 150) score += (150 - d) * 80;
            }
            if (score < bestScore) {
                bestScore = score;
                best = { x: vx, y: vy };
            }
        }
        return best;
    }
    
    isWallAtTime(x, y, time) {
        if (x < 0 || x > width || y < 0 || y > height) return true;
        // Synced with index.html constants
        // CELL_SIZE = 8, NOISE_SCALE = 0.05, TIME_SCALE = 0.1, WALL_THRESHOLD = 0.15
        const n = Simplex.noise3D(x * 0.05 / 8, y * 0.05 / 8, time * 0.1);
        return n > 0.15;
    }
    
    isWallLine(x1, y1, x2, y2) {
        const steps = 5;
        for(let i=0; i<=steps; i++) {
            const t = i/steps;
            const x = x1 + (x2-x1)*t;
            const y = y1 + (y2-y1)*t;
            if (isWall(x, y)) return true;
        }
        return false;
    }
    
    hasLineOfSight(x1, y1, x2, y2) {
        const dist = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.ceil(dist / 10);
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const cx = x1 + (x2 - x1) * t;
            const cy = y1 + (y2 - y1) * t;
            if (isWall(cx, cy)) return false;
        }
        return true;
    }
    
    drawDebug() {
        if (!this.targetSpot) return;
        ctx.strokeStyle = '#0f0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(player.x, player.y);
        this.path.forEach(p => ctx.lineTo(p.x, p.y)); ctx.stroke();
        ctx.fillStyle = 'rgba(0, 255, 0, 0.5)'; ctx.fillRect(this.targetSpot.x - 5, this.targetSpot.y - 5, 10, 10);
    }
}

window.addEventListener('load', () => {
    // Allow other pages to opt out of the default bot boot (e.g., training harness).
    if (window.M4_DISABLE_AUTO_BOOT) return;
    setTimeout(() => { window.voidBot = new M4NeuralBot(); }, 500);
});
