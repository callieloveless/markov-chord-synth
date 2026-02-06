/**
 * Audio Engine Wrapper
 * Handles RNBO device management and voice leading logic.
 */

const AudioEngine = (() => {
    let context = null;
    let device = null;
    let masterGain = null;
    let lastVoicedMidi = [];

    // Voice Leading Constraints
    const RANGES = {
        BASS_MIN: 36,
        BASS_MAX: 48,
        BODY_MIN: 48,
        BODY_MAX: 84
    };

    /**
     * "Smart Voicing" - Applies nearest-neighbor voice leading 
     * to prevent jumps between chords.
     */
    function computeVoicing(rawMidi) {
        if (!rawMidi || !rawMidi.length) return [];

        // Normalize to Pitch Classes (0-11)
        const pcs = [...new Set(rawMidi.map(n => n % 12))];
        const root = pcs[0]; // Assuming input sorts root first
        const bodyPCs = pcs.slice(1).sort((a, b) => a - b);

        // 1. Anchor Bass
        let bass = root + 36;
        while (bass < RANGES.BASS_MIN) bass += 12;
        while (bass > RANGES.BASS_MAX) bass -= 12;
        if (bass < RANGES.BASS_MIN) bass = RANGES.BASS_MIN; // hard clamp

        // 2. Lead the Body
        let voicedBody = [];

        if (lastVoicedMidi.length === 0) {
            // First chord: Center around middle C (60)
            voicedBody = bodyPCs.map(pc => {
                let note = pc + 60;
                while (note > RANGES.BODY_MAX) note -= 12;
                while (note < RANGES.BODY_MIN) note += 12;
                return note;
            });
        } else {
            // Subsequent chords: Minimize distance from previous center
            const prevBody = lastVoicedMidi.slice(1);
            const prevCenter = prevBody.length > 0 
                ? prevBody.reduce((a, b) => a + b, 0) / prevBody.length 
                : 60;

            voicedBody = bodyPCs.map(pc => {
                let candidate = pc + 60;
                let diff = candidate - prevCenter;
                
                // Shift octaves to stay close
                if (diff > 6) candidate -= 12;
                if (diff < -6) candidate += 12;

                // Clamp to body range
                while (candidate < RANGES.BODY_MIN) candidate += 12;
                while (candidate > RANGES.BODY_MAX) candidate -= 12;
                return candidate;
            });
        }

        // 3. Remove Clumps (Internal Spread)
        voicedBody.sort((a, b) => a - b);
        for (let i = 1; i < voicedBody.length; i++) {
            const prev = voicedBody[i - 1];
            if ((voicedBody[i] - prev) <= 2 && (voicedBody[i] + 12) <= RANGES.BODY_MAX) {
                voicedBody[i] += 12;
            }
        }
        voicedBody.sort((a, b) => a - b);

        const result = [bass, ...voicedBody];
        lastVoicedMidi = result;
        return result;
    }

    async function init() {
        if (device) return;

        const WAContext = window.AudioContext || window.webkitAudioContext;
        context = new WAContext();

        masterGain = context.createGain();
        masterGain.gain.value = 0.5;
        masterGain.connect(context.destination);

        try {
            const response = await fetch('/static/export/patch.export.json');
            if (!response.ok) throw new Error("Export file missing");
            
            const patcher = await response.json();
            device = await RNBO.createDevice({ context, patcher });
            device.node.connect(masterGain);

        } catch (err) {
            console.error("RNBO Setup Failed:", err);
            // If the UI error handler exists, use it
            if (typeof renderErrorLog === 'function') {
                renderErrorLog("Audio Init Failed", [{ chord: "System", error: "RNBO patch not found" }]);
            }
        }
    }

    function setVolume(val) {
        if (!context || !masterGain) return;
        masterGain.gain.setTargetAtTime(parseFloat(val), context.currentTime, 0.02);
    }

    function play(midiNumbers, durationMs) {
        if (!device || !context) return;

        const now = context.currentTime * 1000;
        
        midiNumbers.forEach(note => {
            const vel = 80 + Math.random() * 20; // Humanize velocity
            
            const noteOn = new RNBO.MIDIEvent(now, 0, [144, note, vel]);
            const noteOff = new RNBO.MIDIEvent(now + (durationMs * 0.95), 0, [128, note, 0]);
            
            device.scheduleEvent(noteOn);
            device.scheduleEvent(noteOff);
        });
    }

    function resume() {
        if (context && context.state === 'suspended') {
            context.resume();
        }
    }

    // Public API
    return {
        init,
        resume,
        setVolume,
        play,
        computeVoicing
    };
})();

// Global bridge for HTML slider
window.setGlobalVolume = AudioEngine.setVolume;