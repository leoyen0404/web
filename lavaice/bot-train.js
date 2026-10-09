/**
 * TRAINING BOT HARNESS
 * A thin wrapper around M4NeuralBot that auto-enables training,
 * auto-restarts on death, and logs per-run stats (time, score, wave).
 */
class TrainingBot extends M4NeuralBot {
    async init() {
        // Run log state
        this.runLog = [];
        this.runStart = performance.now();
        this.hasRecorded = false;
        this.runCount = 0;

        // Initialize base bot (UI + model + loop)
        await super.init();

        // Training defaults
        this.enabled = true;
        this.isTraining = true;
        this.autoRestart = true;
        this.uiTfStats.style.display = 'block';
        this.uiStatus.innerText = 'ONLINE (TRAIN)';
        this.uiStatus.style.color = '#0f0';

        this.installResetHook();
        this.installDeathHook();
        this.buildTrainPanel();
        this.onGameReset();
    }

    buildTrainPanel() {
        // Attach a small training stats panel under the existing UI.
        const panel = document.createElement('div');
        panel.style.cssText = 'position:fixed;top:20px;left:220px;background:rgba(0,0,0,0.85);border:1px solid #0ff;padding:12px;color:#0ff;font-family:monospace;z-index:9999;pointer-events:none;box-shadow:0 0 20px rgba(0,255,255,0.15);font-size:12px;min-width:200px;';
        panel.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;">TRAIN MODE</div>';
        document.body.appendChild(panel);
        this.trainPanel = panel;
        this.updateTrainPanel();
    }

    installResetHook() {
        const originalReset = window.resetGame;
        if (typeof originalReset !== 'function') return;
        window.resetGame = (...args) => {
            const result = originalReset.apply(window, args);
            this.onGameReset();
            return result;
        };
    }

    installDeathHook() {
        const originalDie = window.die;
        if (typeof originalDie !== 'function') return;
        window.die = (...args) => {
            // Record immediately on death so auto-restart does not skip logging.
            if (!this.hasRecorded) {
                this.recordRun();
                this.hasRecorded = true;
            }
            return originalDie.apply(window, args);
        };
    }

    onGameReset() {
        this.runStart = performance.now();
        this.hasRecorded = false;
        this.runCount += 1;
        this.updateTrainPanel();
    }

    recordRun() {
        const durationMs = Math.max(0, performance.now() - this.runStart);
        const entry = {
            timestamp: Date.now(),
            durationMs,
            score,
            wave
        };
        this.runLog.push(entry);
        if (this.runLog.length > 50) this.runLog.shift();
        this.updateTrainPanel(entry);
        console.log('[TRAIN-BOT] Run recorded', entry);
    }

    updateTrainPanel(latestEntry) {
        if (!this.trainPanel) return;
        const last = latestEntry || this.runLog[this.runLog.length - 1];
        const bestScore = this.runLog.reduce((m, r) => Math.max(m, r.score), 0);
        const avgDurSec = this.runLog.length ? (this.runLog.reduce((s, r) => s + r.durationMs, 0) / this.runLog.length / 1000).toFixed(1) : '0.0';
        const lastLine = last ? `${last.score} pts • wave ${last.wave} • ${(last.durationMs/1000).toFixed(1)}s` : 'n/a';
        this.trainPanel.innerHTML = `
            <div style="font-weight:bold;margin-bottom:4px;">TRAIN MODE</div>
            <div>Runs: ${this.runLog.length}</div>
            <div>Last: ${lastLine}</div>
            <div>Best score: ${bestScore}</div>
            <div>Avg dur: ${avgDurSec}s</div>
            <div>Auto-restart: ON</div>
        `;
    }

    update() {
        // Use the base update for control/decision logic
        super.update();

        // Record once per death
        if (isGameOver && !this.hasRecorded) {
            this.recordRun();
            this.hasRecorded = true;
        }

        // Refresh panel every 20 frames to keep cost low
        if (this.frameCount % 20 === 0) this.updateTrainPanel();
    }

    async exportModel() {
        if (!this.model) return;
        await this.model.save('downloads://m4-train');
        console.log('[TRAIN-BOT] Model exported to downloads://m4-train');
    }

    async importModelFromUrl(url) {
        if (!url) throw new Error('importModelFromUrl: url required');
        const loaded = await tf.loadLayersModel(url);
        this.model.setWeights(loaded.getWeights());
        loaded.dispose();
        console.log('[TRAIN-BOT] Model weights imported from URL', url);
    }

    async importModelFromFiles(fileList) {
        if (!fileList || !fileList.length) throw new Error('importModelFromFiles: file list required');
        const loaded = await tf.loadLayersModel(tf.io.browserFiles(fileList));
        this.model.setWeights(loaded.getWeights());
        loaded.dispose();
        console.log('[TRAIN-BOT] Model weights imported from file selection');
    }
}

window.addEventListener('load', () => {
    // Small delay so the game world is ready before the bot starts.
    setTimeout(() => { window.trainBot = new TrainingBot(); }, 600);
});
