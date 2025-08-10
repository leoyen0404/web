document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const body = document.body;
    const settingsButton = document.getElementById('settings-button');
    const dynamicIsland = document.getElementById('dynamicIsland');
    const islandContent = document.getElementById('islandContent');
    const timerDisplay = document.getElementById('timer-display');
    const cpsDisplay = document.getElementById('cps-display');
    const clickArea = document.getElementById('click-area');
    const historyList = document.getElementById('history-list');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    // --- State ---
    let settings = {
        duration: 5, // in seconds
        theme: 'light', // 'light' or 'dark'
        sound: true, // boolean
    };
    let gameState = {
        timerId: null,
        cpsIntervalId: null,
        startTime: 0,
        clicks: 0,
        isActive: false,
        isFinished: true,
    };
    let history = [];

    // --- Audio Context for Click Sound ---
    let audioCtx;
    const createAudioContext = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    };
    const playClickSound = () => {
        if (!settings.sound || !audioCtx) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
    };

    // --- Settings Management ---
    const saveSettings = () => {
        localStorage.setItem('cpsTestSettings', JSON.stringify(settings));
    };

    const loadSettings = () => {
        const saved = localStorage.getItem('cpsTestSettings');
        if (saved) {
            settings = { ...settings, ...JSON.parse(saved) };
        }
        applyTheme();
    };

    const applyTheme = () => {
        body.classList.remove('light-theme', 'dark-theme');
        body.classList.add(`${settings.theme}-theme`);
    };

    // --- Dynamic Island UI ---
    const renderIslandContent = () => {
        const durations = [5, 10, 15, 30];
        const themes = [{label: 'Light', value: 'light'}, {label: 'Dark', value: 'dark'}];
        const sounds = [{label: 'On', value: true}, {label: 'Off', value: false}];

        const createSegmentControl = (items, activeValue, label, onchange) => {
            const group = document.createElement('div');
            group.className = 'setting-group';
            group.innerHTML = `<label>${label}</label>`;
            const control = document.createElement('div');
            control.className = 'segment-control';
            items.forEach(item => {
                const button = document.createElement('button');
                button.className = `segment-button ${item.value === activeValue ? 'active' : ''}`;
                button.textContent = item.label;
                button.onclick = () => {
                    onchange(item.value);
                    renderIslandContent(); // Re-render to update UI
                };
                control.appendChild(button);
            });
            group.appendChild(control);
            return group;
        };

        islandContent.innerHTML = '';
        const durationControl = createSegmentControl(
            durations.map(d => ({ label: `${d}s`, value: d })),
            settings.duration,
            'Duration',
            (value) => {
                settings.duration = value;
                saveSettings();
                resetGameUI();
            }
        );
        const themeControl = createSegmentControl(
            themes,
            settings.theme,
            'Theme',
            (value) => {
                settings.theme = value;
                applyTheme();
                saveSettings();
            }
        );
        const soundControl = createSegmentControl(
            sounds,
            settings.sound,
            'Sound',
            (value) => {
                settings.sound = value;
                saveSettings();
            }
        );
        islandContent.append(durationControl, themeControl, soundControl);
    };

    const toggleIsland = (forceClose = false) => {
        const isExpanded = dynamicIsland.classList.contains('expanded');
        if (forceClose || isExpanded) {
            dynamicIsland.classList.remove('expanded');
            islandContent.style.display = 'none';
        } else {
            renderIslandContent();
            dynamicIsland.classList.add('expanded');
            islandContent.style.display = 'flex';
        }
    };

    // --- History Management ---
    const loadHistory = () => {
        const saved = localStorage.getItem('cpsTestHistory');
        if (saved) {
            history = JSON.parse(saved);
        }
        renderHistory();
    };

    const saveHistory = () => {
        localStorage.setItem('cpsTestHistory', JSON.stringify(history));
    };

    const renderHistory = () => {
        historyList.innerHTML = '';
        history.slice().reverse().forEach(score => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${score.cps} CPS</span><span class="text-secondary">${score.duration}s test</span>`;
            historyList.appendChild(li);
        });
        clearHistoryBtn.style.display = history.length > 0 ? 'block' : 'none';
    };

    const addToHistory = (cps, duration) => {
        history.push({ cps, duration });
        if (history.length > 10) {
            history.shift(); // Keep history to last 10 entries
        }
        saveHistory();
        renderHistory();
    };

    // --- Game Logic ---
    const resetGameUI = () => {
        clickArea.disabled = false;
        clickArea.textContent = 'Click here to start';
        timerDisplay.textContent = settings.duration.toFixed(2);
        cpsDisplay.textContent = '0.00 CPS';
        gameState.isFinished = true;
        gameState.isActive = false;
    };

    const startGame = () => {
        if (gameState.isActive) return;
        createAudioContext(); // Initialize audio on first user interaction
        gameState.clicks = 0;
        gameState.isActive = true;
        gameState.isFinished = false;

        clickArea.textContent = '...';
        clickArea.disabled = true;

        let countdown = 3;
        timerDisplay.textContent = countdown;
        const countdownInterval = setInterval(() => {
            countdown--;
            timerDisplay.textContent = countdown;
            if (countdown === 0) {
                clearInterval(countdownInterval);
                runTest();
            }
        }, 1000);
    };

    const runTest = () => {
        clickArea.disabled = false;
        clickArea.textContent = 'Click!';
        gameState.startTime = Date.now();

        gameState.timerId = setInterval(updateTimer, 10);
        gameState.cpsIntervalId = setInterval(updateCPS, 100);
    };

    const updateTimer = () => {
        const elapsedTime = (Date.now() - gameState.startTime) / 1000;
        const remainingTime = settings.duration - elapsedTime;

        if (remainingTime > 0) {
            timerDisplay.textContent = remainingTime.toFixed(2);
        } else {
            endGame();
        }
    };

    const updateCPS = () => {
        if (!gameState.isActive) return;
        const elapsedTime = (Date.now() - gameState.startTime) / 1000;
        const currentCPS = elapsedTime > 0 ? (gameState.clicks / elapsedTime).toFixed(2) : '0.00';
        cpsDisplay.textContent = `${currentCPS} CPS`;
    };

    const endGame = () => {
        clearInterval(gameState.timerId);
        clearInterval(gameState.cpsIntervalId);
        gameState.isActive = false;

        const finalCPS = (gameState.clicks / settings.duration).toFixed(2);
        cpsDisplay.textContent = `${finalCPS} CPS`;
        timerDisplay.textContent = 'Done!';

        addToHistory(finalCPS, settings.duration);
        setTimeout(resetGameUI, 2000); // Reset after a short delay
    };

    // --- Event Listeners ---
    settingsButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleIsland();
    });

    clickArea.addEventListener('click', () => {
        if (gameState.isFinished) {
            startGame();
        } else if (gameState.isActive) {
            gameState.clicks++;
            playClickSound();
            updateCPS();
        }
    });

    clearHistoryBtn.addEventListener('click', () => {
        history = [];
        saveHistory();
        renderHistory();
    });

    document.addEventListener('click', (e) => {
        if (!dynamicIsland.contains(e.target)) {
            toggleIsland(true); // Force close if click is outside
        }
    });

    // --- Initialization ---
    const init = () => {
        loadSettings();
        loadHistory();
        resetGameUI();
    };

    init();
});
