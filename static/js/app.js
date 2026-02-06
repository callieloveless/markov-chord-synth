/**
 * Main Application Controller
 * Orchestrates the UI, Data Fetching, and Playback Loop.
 */

// State Management
const STATE = {
    chainData: null,
    isPlaying: false,
    sequence: [],
    timer: null,
    stepDuration: 2000 // default ms
};

document.addEventListener("DOMContentLoaded", () => {
    // Init Graph Observer (defined in graph.js)
    const graphWrapper = document.getElementById("graph-wrapper");
    if (graphWrapper && window.graphObserver) {
        window.graphObserver.observe(graphWrapper);
    }
});

// --- UI Logic ---

function setDashboardMode(isActive) {
    const app = document.getElementById('app-container');
    const isLanding = app.classList.contains('landing-mode');

    if (isActive && isLanding) {
        app.classList.remove('landing-mode');
        app.classList.add('dashboard-mode');
    }
}

function updateUIState(status) {
    const playBtn = document.getElementById("playBtn");
    const initBtn = document.getElementById("initBtn");

    switch (status) {
        case 'LOADING':
            playBtn.classList.remove("active");
            playBtn.disabled = true;
            initBtn.innerHTML = '<span class="btn-num">1.</span> Loading...';
            break;
        case 'READY':
            playBtn.disabled = false;
            playBtn.classList.add("suggested");
            initBtn.innerHTML = '<span class="btn-num">1.</span> Reset';
            break;
        case 'ERROR':
            initBtn.innerHTML = '<span class="btn-num">1.</span> Initialize';
            break;
    }
}

// --- Core Logic ---

async function initializeSequence() {
    // 1. Reset Internal State
    stopPlayback();
    updateUIState('LOADING');
    clearErrorLog();

    // 2. Audio Context Resume (Browser Policy)
    await AudioEngine.init();

    setDashboardMode(true);

    const rawProgression = document.getElementById('progressionInput').value;

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progression: rawProgression })
        });

        const data = await response.json();

        if (!response.ok) {
            updateUIState('ERROR');
            return renderErrorLog(data.message, data.details);
        }

        // 3. Hydrate State
        STATE.chainData = data;
        STATE.sequence = [...(data.start_seq || [])];

        // 4. Update Visuals
        // Force a redraw with new data even if dimensions haven't changed
        if (window.GraphViz) window.GraphViz.draw(STATE.chainData);

        updateUIState('READY');

    } catch (err) {
        console.error("Initialization Failed:", err);
        updateUIState('ERROR');
        renderErrorLog("Network Error", [{ chord: "System", error: "Could not reach backend." }]);
    }
}

function togglePlayback() {
    const playBtn = document.getElementById("playBtn");
    if (playBtn.disabled || !STATE.chainData) return;

    // UX: Remove "suggested" glow once interacted with
    playBtn.classList.remove("suggested");
    setDashboardMode(true);

    STATE.isPlaying = !STATE.isPlaying;
    playBtn.classList.toggle("active", STATE.isPlaying);

    // Ensure audio context is alive
    AudioEngine.resume();

    if (STATE.isPlaying) {
        playbackTick();
    } else {
        clearTimeout(STATE.timer);
    }
}

/**
 * Main Sequencer Loop
 * Handles: State resolution -> Visualization -> Audio -> Next State Calculation
 */
function playbackTick() {
    if (!STATE.isPlaying || !STATE.chainData) return;

    // Update speed live
    const speedSeconds = parseFloat(document.getElementById('speedInput').value) || 2.0;
    STATE.stepDuration = speedSeconds * 1000;

    // A. Identify Context (2nd Order: Prev | Curr)
    const history = STATE.sequence;
    const prev = history.length > 1 ? history[history.length - 2] : null;
    const curr = history[history.length - 1];
    
    const stateKey = prev ? `${prev} | ${curr}` : null;

    // B. Trigger Side Effects (Visuals + Audio)
    const nodeData = STATE.chainData.nodes.find(n => n.id === stateKey);
    
    if (window.GraphViz && stateKey) {
        window.GraphViz.highlight(stateKey);
    }

    if (nodeData) {
        const voicedNotes = AudioEngine.computeVoicing(nodeData.midi);
        AudioEngine.play(voicedNotes, STATE.stepDuration);
    }

    // C. Determine Next State
    let nextChord = null;
    
    // Try 2nd order transition
    const options = STATE.chainData.transitions_2nd[stateKey];
    if (options?.length) {
        nextChord = options[Math.floor(Math.random() * options.length)];
    }

    // Fallback to 1st order if dead end
    if (!nextChord) {
        const fallbackOptions = STATE.chainData.transitions_1st[curr];
        if (fallbackOptions?.length) {
            nextChord = fallbackOptions[Math.floor(Math.random() * fallbackOptions.length)];
        }
    }

    // Dead end or loop reset
    if (!nextChord) {
        nextChord = STATE.chainData.start_seq[0];
        STATE.sequence = [...STATE.chainData.start_seq];
        STATE.timer = setTimeout(playbackTick, STATE.stepDuration);
        return;
    }

    // Advance
    STATE.sequence.push(nextChord);
    if (STATE.sequence.length > 3) STATE.sequence.shift(); // Keep buffer small

    STATE.timer = setTimeout(playbackTick, STATE.stepDuration);
}

function stopPlayback() {
    STATE.isPlaying = false;
    clearTimeout(STATE.timer);
}

// --- Error Handling ---

function renderErrorLog(message, details = []) {
    const log = document.getElementById('errorLog');
    if (!log) return;
    
    log.style.display = 'block';

    if (!Array.isArray(details) || details.length === 0) {
        log.innerHTML = `<strong>${message}</strong>`;
        return;
    }

    const listItems = details.map(d => `<li><span class="err-chord">${d.chord}</span>: ${d.error}</li>`).join('');
    log.innerHTML = `<strong>${message}</strong><ul>${listItems}</ul>`;
}

function clearErrorLog() {
    const log = document.getElementById('errorLog');
    if (log) {
        log.style.display = 'none';
        log.innerHTML = '';
    }
}