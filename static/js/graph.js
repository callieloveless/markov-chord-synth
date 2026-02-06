/**
 * D3.js Force Directed Graph Visualization
 * Handles graph rendering, simulation, and highlighting.
 */

window.GraphViz = (() => {
    let simulation = null;
    let svg = null;
    let gMain = null;
    
    // Selections
    let linkVisible, linkHit, nodeElements;
    
    // Tooltip singleton
    const tooltip = d3.select("body").append("div").attr("class", "tooltip");

    function initSimulation(width, height, nodes, links) {
        if (simulation) simulation.stop();

        simulation = d3.forceSimulation(nodes)
            .force("link", d3.forceLink(links).id(d => d.id).distance(250))
            .force("charge", d3.forceManyBody().strength(-1000))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("collide", d3.forceCollide().radius(80));

        // Sync D3 tick with DOM
        simulation.on("tick", () => {
            if (linkVisible) {
                linkVisible
                    .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
            }
            if (linkHit) {
                linkHit
                    .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
            }
            if (nodeElements) {
                nodeElements.attr("transform", d => `translate(${d.x},${d.y})`);
            }
        });
    }

    function draw(graphData) {
        const container = document.getElementById("graph-wrapper");
        if (!container || container.clientWidth < 10) return;

        svg = d3.select("#graph");
        svg.selectAll("*").remove();

        gMain = svg.append("g").attr("class", "view-container");

        const width = container.clientWidth;
        const height = container.clientHeight;

        // --- Zoom Behavior ---
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])
            .on("zoom", (e) => gMain.attr("transform", e.transform));
        
        svg.call(zoom).on("dblclick.zoom", null);

        // --- Markers ---
        gMain.append("defs").selectAll("marker")
            .data(["end"]).enter().append("marker")
            .attr("id", "arrow")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 38)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path").attr("d", "M0,-5L10,0L0,5").attr("fill", "#555");

        initSimulation(width, height, graphData.nodes, graphData.links);

        // --- Links ---
        const linkGroup = gMain.append("g").attr("class", "links");
        
        linkVisible = linkGroup.selectAll(".link-visible")
            .data(graphData.links).enter().append("line")
            .attr("class", "link-visible")
            .attr("stroke", "#555")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", 2)
            .attr("marker-end", "url(#arrow)")
            .style("pointer-events", "none");

        // Invisible fat lines for easier hovering
        linkHit = linkGroup.selectAll(".link-hit")
            .data(graphData.links).enter().append("line")
            .attr("class", "link-hit")
            .attr("stroke", "rgba(0,0,0,0)")
            .attr("stroke-width", 25)
            .attr("cursor", "pointer")
            .on("mouseover", handleLinkHover)
            .on("mouseout", handleLinkOut);

        // --- Nodes ---
        nodeElements = gMain.append("g").selectAll("g")
            .data(graphData.nodes).enter().append("g").attr("class", "node")
            .on("mouseover", (e, d) => showTooltip(e, `<strong>${d.label}</strong>`))
            .on("mouseout", hideTooltip);

        nodeElements.append("circle")
            .attr("r", 35)
            .attr("fill", "#111")
            .attr("stroke", "#fff")
            .attr("stroke-width", 2);

        nodeElements.append("text")
            .text(d => d.label)
            .attr("text-anchor", "middle")
            .attr("dy", 4)
            .style("fill", "#00f2ff")
            .style("pointer-events", "none")
            .style("font-size", "10px")
            .style("font-weight", "bold");

        // Drag Behavior
        nodeElements.call(d3.drag()
            .on("start", (e, d) => {
                if (!e.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x; d.fy = d.y;
            })
            .on("drag", (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on("end", (e, d) => {
                if (!e.active) simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
            }));
    }

    // --- Interaction Handlers ---

    function handleLinkHover(event, d) {
        linkVisible.filter(l => l === d)
            .attr("stroke", "#ff00cc")
            .attr("stroke-opacity", 1.0);
        
        const html = `
            <strong>${d.source.label} &rarr; <br>${d.target.label}</strong><br/>
            Prob: ${d.probability}<br/>
            Surprisal: ${d.surprisal} bits
        `;
        showTooltip(event, html);
    }

    function handleLinkOut(event, d) {
        linkVisible.filter(l => l === d)
            .attr("stroke", "#555")
            .attr("stroke-opacity", 0.6);
        hideTooltip();
    }

    function showTooltip(event, html) {
        tooltip.transition().duration(200).style("opacity", 1);
        tooltip.html(html)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
    }

    function hideTooltip() {
        tooltip.transition().duration(500).style("opacity", 0);
    }

    function highlightActiveState(nodeId) {
        if (!nodeElements || !linkVisible) return;

        // Reset All
        nodeElements.select("circle").style("fill", "#111").style("stroke", "#fff");
        nodeElements.select("text").style("fill", "#00f2ff");
        linkVisible.attr("stroke", "#555").attr("stroke-opacity", 0.6);

        // Active Node
        const activeNode = nodeElements.filter(d => d.id === nodeId);
        activeNode.select("circle").style("fill", "#ff00cc").style("stroke", "#ff00cc");
        activeNode.select("text").style("fill", "#fff");

        // Active Outgoing Links
        linkVisible.filter(d => d.source.id === nodeId)
            .attr("stroke", "#ff00cc")
            .attr("stroke-opacity", 1);
    }

    return {
        draw,
        highlight: highlightActiveState,
        getSimulation: () => simulation
    };
})();

// --- Layout Observer ---
// Exposed globally so app.js can init it on DOMContentLoaded
window.graphObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        
        // Prevent firing on initialization or hidden states
        if (w > 50 && h > 50) {
            // Re-center simulation if it exists
            const sim = window.GraphViz.getSimulation();
            if (sim) {
                sim.force("center", d3.forceCenter(w / 2, h / 2));
                sim.alpha(0.3).restart();
            } else if (typeof STATE !== 'undefined' && STATE.chainData) {
                // If we have data but no sim, draw it
                window.GraphViz.draw(STATE.chainData);
            }
        }
    }
});

function toggleFullscreen() {
    const container = document.getElementById("graph-wrapper");
    container.classList.toggle("fullscreen");
    
    const btn = document.getElementById("fs-btn");
    const isFs = container.classList.contains("fullscreen");
    btn.innerHTML = isFs ? "&#x2715;" : "&#x26F6;";
}