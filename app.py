import math
from collections import Counter, defaultdict
from flask import Flask, render_template, request, jsonify
from music21 import harmony

app = Flask(__name__)

def parse_midi_pitches(chord_name: str) -> list[int]:
    """Uses music21 to resolve chord symbols to MIDI numbers."""
    try:
        c = harmony.ChordSymbol(chord_name)
        if not c.pitches:
            raise ValueError("No pitches identified")
        return sorted([p.midi for p in c.pitches])
    except Exception as e:
        raise ValueError(str(e))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/analyze', methods=['POST'])
def analyze():
    data = request.json
    raw_input = data.get('progression', [])

    # Input Sanitization
    if isinstance(raw_input, str):
        progression = raw_input.split()
    elif isinstance(raw_input, list):
        progression = [str(c).strip() for c in raw_input if str(c).strip()]
    else:
        return jsonify({"message": "Invalid format"}), 400

    if not progression:
        return jsonify({"message": "Empty progression"}), 400

    # 1. Resolve Chords to MIDI
    unique_chords = set(progression)
    chord_midi_map = {}
    parse_errors = []
    
    for chord in unique_chords:
        try:
            chord_midi_map[chord] = parse_midi_pitches(chord)
        except ValueError as ve:
            parse_errors.append({"chord": chord, "error": str(ve)})

    if parse_errors:
        return jsonify({
            "status": "error", 
            "message": "Invalid Chords", 
            "details": parse_errors
        }), 400

    # 2. Build State Nodes (Second-order: "Previous | Current")
    # This creates the visual nodes for the graph.
    node_registry = {} 
    nodes = []
    
    if len(progression) >= 2:
        for i in range(len(progression) - 1):
            prev = progression[i]
            curr = progression[i+1]
            
            # Node ID Format: "A | B"
            node_id = f"{prev} | {curr}"
            
            if node_id not in node_registry:
                node_obj = {
                    "id": node_id,
                    "label": f"{prev} → {curr}",
                    "curr": curr,
                    "midi": chord_midi_map.get(curr, [])
                }
                node_registry[node_id] = node_obj
                nodes.append(node_obj)

    # 3. Calculate Transitions (Links)
    # Counts occurrences of triplet sequences (A->B)->C
    transition_counts = Counter()
    source_totals = Counter()

    if len(progression) >= 3:
        for i in range(len(progression) - 2):
            prev = progression[i]
            curr = progression[i+1]
            next_ = progression[i+2]
            
            source_id = f"{prev} | {curr}"
            target_id = f"{curr} | {next_}"
            
            transition_counts[(source_id, target_id)] += 1
            source_totals[source_id] += 1

    links = []
    for (src, tgt), count in transition_counts.items():
        total = source_totals[src]
        prob = count / total if total > 0 else 0
        # Surprisal (Information content) in bits
        surprisal = -math.log2(prob) if prob > 0 else 0
        
        links.append({
            "source": src, 
            "target": tgt,
            "count": count, 
            "probability": round(prob, 4),
            "surprisal": round(surprisal, 2)
        })

    # 4. Lookup Tables for Next-Step Logic
    transitions_2nd_order = defaultdict(list)
    transitions_1st_order = defaultdict(list) 

    if len(progression) >= 2:
        for i in range(len(progression) - 1):
            curr = progression[i]
            next_ = progression[i+1]
            
            # Fallback (1st order)
            transitions_1st_order[curr].append(next_)
            
            # Primary (2nd order)
            if i < len(progression) - 2:
                future = progression[i+2]
                key = f"{curr} | {next_}" 
                transitions_2nd_order[key].append(future)

    # Return initial sequence for playback start
    start_seq = progression[:2] if len(progression) >= 2 else progression

    return jsonify({
        "nodes": nodes,
        "links": links,
        "transitions_2nd": transitions_2nd_order,
        "transitions_1st": transitions_1st_order,
        "start_seq": start_seq
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)