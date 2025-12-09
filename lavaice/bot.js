/**
 * V0ID SH!FTER - M4 NEURAL CORE BOT (v4.0 - TensorFlow.js Edition)
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
        
        // 傳統算法配置
        this.config = {
            gridSize: 20,
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
            <div style="font-weight:bold;border-bottom:1px solid #0ff;margin-bottom:5px;"> M4 NEURAL CORE v4.0</div>
            <div id="m4-status">STANDBY</div>
            <div id="m4-mode" style="color:#ff0;font-size:11px;">MODE: HEURISTIC</div>
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
        
        // 1. 感知環境 (Perception)
        const state = this.getEnvironmentState();
        
        // 2. TF.js 決策 (Decision)
        let strategy = 0; // Default: Balanced
        if (this.useTF && this.model) {
            tf.tidy(() => {
                const input = tf.tensor2d([state], [1, 20]);
                const prediction = this.model.predict(input);
                strategy = prediction.argMax(1).dataSync()[0];
            });
        }
        
        // 更新 UI 顯示當前策略
        const strategies = ['BALANCED', 'AGGRESSIVE', 'EVASIVE', 'CAMPING'];
        if (this.frameCount % 10 === 0) this.uiMode.innerText = `STRATEGY: ${strategies[strategy]}`;
        
        // 3. 根據策略調整權重 (Dynamic Weights)
        this.adjustWeights(strategy);
        
        // 4. 執行 A* 導航 (Navigation)
        const bestSpot = this.analyzeTerrainAndFindSafeSpot();
        this.targetSpot = bestSpot;
        if (bestSpot) {
            this.path = this.findPath(player.x, player.y, bestSpot.x, bestSpot.y);
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
    
    getEnvironmentState() {
        // 構建 20維 狀態向量
        // [0-7]: 8方向牆壁距離
        // [8-15]: 8方向敵人距離
        // [16]: 玩家血量 (假設有) -> 這裡用 Dash CD 代替
        // [17]: 最近敵人距離
        // [18]: 敵人數量
        // [19]: 當前 Wave
        
        const sensors = [];
        const dirs = [[1,0], [0.7,0.7], [0,1], [-0.7,0.7], [-1,0], [-0.7,-0.7], [0,-1], [0.7,-0.7]];
        
        // Wall Sensors
        dirs.forEach(dir => {
            let dist = 0;
            for(let i=10; i<300; i+=20) {
                if(isWall(player.x + dir[0]*i, player.y + dir[1]*i)) { dist = i; break; }
            }
            sensors.push(dist/300); // Normalize
        });
        
        // Enemy Sensors
        dirs.forEach(dir => {
            let minDist = 1.0;
            enemies.forEach(e => {
                // 簡單的點積判斷方向
                const dx = e.x - player.x;
                const dy = e.y - player.y;
                const len = Math.sqrt(dx*dx + dy*dy);
                const ndx = dx/len;
                const ndy = dy/len;
                const dot = ndx*dir[0] + ndy*dir[1];
                if (dot > 0.8) { // 在這個方向上
                    const d = len/500;
                    if (d < minDist) minDist = d;
                }
            });
            sensors.push(minDist);
        });
        
        sensors.push(player.dashCooldown / 60);
        
        let nearestEnemy = Infinity;
        enemies.forEach(e => nearestEnemy = Math.min(nearestEnemy, Math.hypot(e.x-player.x, e.y-player.y)));
        sensors.push(Math.min(1, nearestEnemy/500));
        
        sensors.push(Math.min(1, enemies.length/20));
        sensors.push(Math.min(1, wave/10));
        
        return sensors;
    }
    
    adjustWeights(strategy) {
        const w = this.config.weights;
        switch(strategy) {
            case 1: // AGGRESSIVE (BERSERKER)
                w.enemy = 0; // 完全無視敵人危險，只管衝
                w.optimalRange = -2000; // 極度渴望貼臉 (Berserker Mode)
                w.futureWall = 10000; // 降低撞牆恐懼以換取機動性
                break;
            case 2: // EVASIVE
                w.enemy = 8000; // 遠離敵人
                w.optimalRange = 500;
                break;
            case 3: // CAMPING
                w.corner = -5000; // 極度喜歡角落
                break;
            default: // BALANCED
                w.enemy = 2000; // 降低默認恐懼值 (原 5000)
                w.optimalRange = -200;
                w.corner = 2000;
        }
    }
    
    async trainModel(state, action) {
        // 簡單的獎勵機制：存活時間 + 擊殺
        // 這裡簡化為：只要沒死就是正獎勵
        const reward = 0.1; 
        
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
        
        for (let y = 0; y < gridH; y++) {
            for (let x = 0; x < gridW; x++) {
                const wx = x * this.config.gridSize + this.config.gridSize/2;
                const wy = y * this.config.gridSize + this.config.gridSize/2;
                
                if (isWall(wx, wy)) continue;
                
                // 1. 安全間隙檢查 (Clearance Check) - 讓機器人走在路中間
                let clearanceScore = 0;
                const checks = [20, 40]; // 檢查半徑
                let isSafe = true;
                for(let d of checks) {
                    if (isWall(wx+d, wy) || isWall(wx-d, wy) || isWall(wx, wy+d) || isWall(wx, wy-d)) {
                        isSafe = false;
                        break;
                    }
                    clearanceScore += 1;
                }
                if (!isSafe && clearanceScore === 0) continue; // 太窄了，不要去
                
                let score = 0;
                score -= clearanceScore * 5000; // 獎勵開闊地帶
                
                // 2. 未來牆壁預測 (Future Wall Prediction) - 增加預判時間
                if (this.isWallAtTime(wx, wy, gameTime + 2.0)) score += this.config.weights.futureWall * 5; // 嚴重懲罰即將生成的牆
                
                let distToNearestEnemy = Infinity;
                let nearestEnemy = null;
                for (let e of enemies) {
                    const d = Math.hypot(e.x - wx, e.y - wy);
                    if (d < distToNearestEnemy) { distToNearestEnemy = d; nearestEnemy = e; }
                    if (d < 100) score += this.config.weights.enemy * (100 - d) / 100;
                }
                
                if (distToNearestEnemy > 200 && distToNearestEnemy < 400) score += this.config.weights.optimalRange;
                
                // LOS Check
                if (nearestEnemy && distToNearestEnemy < 500) {
                    if (this.hasLineOfSight(wx, wy, nearestEnemy.x, nearestEnemy.y)) score -= 500;
                    else score += 500;
                }
                
                const distToPlayer = Math.hypot(player.x - wx, player.y - wy);
                score += distToPlayer * 0.5;
                
                if (score < minScore) { minScore = score; bestPoint = { x: wx, y: wy }; }
            }
        }
        return bestPoint;
    }
    
    findPath(startX, startY, endX, endY) {
        const cellSize = 40;
        const startNode = { x: Math.floor(startX/cellSize), y: Math.floor(startY/cellSize), g:0, h:0, f:0, parent:null };
        const endNode = { x: Math.floor(endX/cellSize), y: Math.floor(endY/cellSize) };
        let openList = [startNode];
        let closedSet = new Set();
        let iterations = 0;
        
        while (openList.length > 0 && iterations < 200) {
            iterations++;
            let lowInd = 0;
            for(let i=0; i<openList.length; i++) if(openList[i].f < openList[lowInd].f) lowInd = i;
            let currentNode = openList[lowInd];
            
            if(Math.abs(currentNode.x - endNode.x) <= 1 && Math.abs(currentNode.y - endNode.y) <= 1) {
                let curr = currentNode;
                let ret = [];
                while(curr.parent) { ret.push({x: curr.x*cellSize+cellSize/2, y: curr.y*cellSize+cellSize/2}); curr = curr.parent; }
                return ret.reverse();
            }
            
            openList.splice(lowInd, 1);
            closedSet.add(`${currentNode.x},${currentNode.y}`);
            
            const dirs = [[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
            for(let i=0; i<dirs.length; i++) {
                const nx = currentNode.x + dirs[i][0];
                const ny = currentNode.y + dirs[i][1];
                if(closedSet.has(`${nx},${ny}`)) continue;
                
                const wx = nx*cellSize+cellSize/2;
                const wy = ny*cellSize+cellSize/2;
                if (isWall(wx, wy)) continue;
                
                // SAFETY BUFFER UPDATE: 擴大碰撞體積檢查
                // 機器人現在會認為自己比實際更"胖"，從而預留更多空間
                const nodeR = 35; // 原 15 -> 35 (極大安全緩衝)
                if (isWall(wx+nodeR, wy) || isWall(wx-nodeR, wy) || isWall(wx, wy+nodeR) || isWall(wx, wy-nodeR)) continue;
                
                if (this.isWallAtTime(wx, wy, gameTime + 0.5)) continue;
                
                let gScore = currentNode.g + 1;
                let gScoreIsBest = false;
                let neighbor = openList.find(n => n.x === nx && n.y === ny);
                
                if(!neighbor) { gScoreIsBest = true; neighbor = { x: nx, y: ny, g: gScore, h: 0, f: 0, parent: currentNode }; openList.push(neighbor); }
                else if(gScore < neighbor.g) gScoreIsBest = true;
                
                if(gScoreIsBest) { neighbor.parent = currentNode; neighbor.g = gScore; neighbor.h = Math.abs(neighbor.x - endNode.x) + Math.abs(neighbor.y - endNode.y); neighbor.f = neighbor.g + neighbor.h; }
            }
        }
        return [];
    }
    
    executeMovement() {
        // --- FLUID MOVEMENT SYSTEM (Vector Based) ---
        
        // 1. Determine Base Target Vector (Seek)
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

        // Calculate Seek Vector
        let dx = targetX - player.x;
        let dy = targetY - player.y;
        let len = Math.hypot(dx, dy);
        if (len > 0) { dx /= len; dy /= len; } // Normalize

        // 2. Add Wander Noise (Never stand still)
        // Slowly change wander angle
        this.wanderAngle += (Math.random() - 0.5) * 0.5;
        const wanderWeight = 0.3;
        dx += Math.cos(this.wanderAngle) * wanderWeight;
        dy += Math.sin(this.wanderAngle) * wanderWeight;

        // 3. Wall Repulsion (Fluid Avoidance)
        const lookAhead = 40;
        const whiskers = 8;
        for (let i = 0; i < whiskers; i++) {
            const angle = (i / whiskers) * Math.PI * 2;
            const wx = Math.cos(angle);
            const wy = Math.sin(angle);
            
            // Check for wall
            if (isWall(player.x + wx * lookAhead, player.y + wy * lookAhead)) {
                // Repulse strongly from this direction
                dx -= wx * 2.5;
                dy -= wy * 2.5;
            }
        }

        // 4. Combat Strafing (Circle Strafe)
        // If there is a nearby enemy, try to move perpendicular to them
        let nearestEnemy = null;
        let minDist = Infinity;
        enemies.forEach(e => {
            const d = Math.hypot(e.x - player.x, e.y - player.y);
            if (d < minDist) { minDist = d; nearestEnemy = e; }
        });

        if (nearestEnemy && minDist < 300) {
            const edx = nearestEnemy.x - player.x;
            const edy = nearestEnemy.y - player.y;
            // Perpendicular vector (-y, x)
            let strafeX = -edy;
            let strafeY = edx;
            const slen = Math.hypot(strafeX, strafeY);
            if (slen > 0) {
                // Normalize and apply
                // Flip direction based on time to simulate "dancing"
                const dir = Math.sin(gameTime * 2) > 0 ? 1 : -1;
                dx += (strafeX / slen) * dir * 1.5;
                dy += (strafeY / slen) * dir * 1.5;
            }
            
            // Also maintain distance (Backpedal if too close)
            if (minDist < 150) {
                dx -= (edx / minDist) * 2.0;
                dy -= (edy / minDist) * 2.0;
            }
        }

        // 5. Apply to Keys (Analog Simulation)
        // We want to press keys that align with the final dx, dy vector
        // Threshold is lower to allow fine adjustments
        keys['KeyW'] = dy < -0.2;
        keys['KeyS'] = dy > 0.2;
        keys['KeyA'] = dx < -0.2;
        keys['KeyD'] = dx > 0.2;

        // 6. Opportunistic Dash (Fluid Mobility)
        // If we have a strong desire to move in a direction, and it's clear, DASH!
        const desireStrength = Math.hypot(dx, dy);
        if (desireStrength > 2.0 && player.dashCooldown <= 0) {
            // Only dash if we are not about to hit a wall
            const dashDist = 100;
            if (!isWall(player.x + dx * dashDist, player.y + dy * dashDist)) {
                // 10% chance per frame to dash if conditions met (don't spam instantly)
                if (Math.random() < 0.05) tryDash();
            }
        }
    }
    
    executeCombat(strategy) {
        keys['ArrowUp'] = false; keys['ArrowDown'] = false; keys['ArrowLeft'] = false; keys['ArrowRight'] = false;
        if (enemies.length === 0) return;
        
        let bestTarget = null;
        let minScore = Infinity;
        
        enemies.forEach(e => {
            const dist = Math.hypot(e.x - player.x, e.y - player.y);
            if (!this.hasLineOfSight(player.x, player.y, e.x, e.y)) return;
            
            let score = dist + (e.hp * 50);
            if (strategy === 1) {
                score = dist; // Aggressive: 純粹打最近的，不管血量
            }
            if (score < minScore) { minScore = score; bestTarget = e; }
        });
        
        if (bestTarget) {
            // AIMING V2: 增強型預判與鎖定
            const bulletSpeed = 10;
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
                targetX = ex + (edx/elen) * eSpeed * timeToHit;
                targetY = ey + (edy/elen) * eSpeed * timeToHit;
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
        
        // 1. Bullet Dodge (Matrix Mode)
        // Check for incoming bullets
        for (let b of bullets) {
            const dist = Math.hypot(b.x - player.x, b.y - player.y);
            if (dist < 60) {
                // Is it heading towards me?
                // Simple check: is distance decreasing?
                const nextDist = Math.hypot((b.x + b.vx) - player.x, (b.y + b.vy) - player.y);
                if (nextDist < dist) {
                    // DODGE! Dash perpendicular to bullet path
                    // Bullet vector: (b.vx, b.vy)
                    // Perpendicular: (-b.vy, b.vx)
                    const dodgeX = -b.vy;
                    const dodgeY = b.vx;
                    
                    // Choose direction that moves us away from walls
                    if (!isWall(player.x + dodgeX * 5, player.y + dodgeY * 5)) {
                        keys['KeyW'] = dodgeY < 0; keys['KeyS'] = dodgeY > 0;
                        keys['KeyA'] = dodgeX < 0; keys['KeyD'] = dodgeX > 0;
                    } else {
                        keys['KeyW'] = -dodgeY < 0; keys['KeyS'] = -dodgeY > 0;
                        keys['KeyA'] = -dodgeX < 0; keys['KeyD'] = -dodgeX > 0;
                    }
                    tryDash();
                    return;
                }
            }
        }
        
        // 2. Swarm Panic (Original Logic, kept for safety)
        let nearbyEnemies = 0;
        let avgX = 0, avgY = 0;
        enemies.forEach(e => { 
            if (Math.hypot(e.x - player.x, e.y - player.y) < 100) {
                nearbyEnemies++; 
                avgX += e.x;
                avgY += e.y;
            }
        });
        
        if (nearbyEnemies >= 3) {
            avgX /= nearbyEnemies;
            avgY /= nearbyEnemies;
            const dx = player.x - avgX;
            const dy = player.y - avgY;
            keys['KeyW'] = dy < -5; keys['KeyS'] = dy > 5; keys['KeyA'] = dx < -5; keys['KeyD'] = dx > 5;
            tryDash();
            return;
        }
        
        // 3. Gap Crossing (Original Logic)
        if (this.path.length > 0) {
            const nextNode = this.path[0];
            if (this.isWallLine(player.x, player.y, nextNode.x, nextNode.y)) {
                tryDash();
                return;
            }
        }
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
