# Markov Chord Synth

A second-order Markov chain visualization tool for generative chord progressions. 
**[Live Demo](https://markov-chord-synth.onrender.com/)**

## How it works
This application uses a Python (Flask) backend to analyze chord progressions using `music21`. It builds a directed graph where nodes represent state transitions (e.g., `Dm7 -> G7`). The frontend uses D3.js for visualization and WebAudio (RNBO) with a custom voice-leading engine for playback.

## Tech Stack
- **Backend:** Python, Flask, Music21
- **Frontend:** JavaScript, D3.js
- **Audio:** Cycling '74 RNBO