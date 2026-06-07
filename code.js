"use strict";
// code.ts — main thread (sandbox side)
// Edit this file and run `npm run build` (or `npm run watch`) to generate code.js.
// Determines the App Store Connect display family from each node's exported
// resolution, and names it with a "device type + screen size" label (e.g. iPhone69 / iPad13).
// Sequence numbers follow the canvas reading order (top→bottom, left→right) and reset per device family.
figma.showUI(__html__, { width: 340, height: 540, themeColors: true });
// ---- Size → label (keyed by portrait px; no periods) -----------------
const SIZE_LABELS = {
    // iPhone
    "1320x2868": "iPhone69",
    "1290x2796": "iPhone69",
    "1260x2736": "iPhone69",
    "1206x2622": "iPhone63",
    "1179x2556": "iPhone63",
    "1284x2778": "iPhone65",
    "1242x2688": "iPhone65",
    "1170x2532": "iPhone61",
    "1125x2436": "iPhone61",
    "1080x2340": "iPhone61",
    "1242x2208": "iPhone55",
    "750x1334": "iPhone47",
    // iPad
    "2064x2752": "iPad13",
    "2048x2732": "iPad13",
    "1488x2266": "iPad11",
    "1668x2420": "iPad11",
    "1668x2388": "iPad11",
    "1640x2360": "iPad11",
    "1668x2224": "iPad105",
    "1536x2048": "iPad97",
    "768x1024": "iPad97",
};
// Resolve the display family label from exported px (orientation normalized to portrait)
function resolveLabel(width, height, scale) {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const key = `${Math.min(w, h)}x${Math.max(w, h)}`;
    return SIZE_LABELS[key] || null; // null if it doesn't match a standard size
}
// ---- Collect target nodes ---------------------------------------------
// Export the selected layers as-is: don't filter by type, keep only exportable ones.
function getTargetNodes() {
    const sel = figma.currentPage.selection;
    const source = sel.length > 0 ? sel : figma.currentPage.children;
    return source.filter((n) => typeof n.exportAsync === "function");
}
// ---- Reorder into reading order by position (row clustering) ----------
function orderByCanvasPosition(nodes, rowTolerance) {
    const sorted = [...nodes].sort((a, b) => a.y - b.y);
    const rows = [];
    for (const node of sorted) {
        const centerY = node.y + node.height / 2;
        let placed = false;
        for (const row of rows) {
            if (Math.abs(centerY - row.centerY) <= rowTolerance) {
                row.nodes.push(node);
                row.centerY = (row.centerY * row.count + centerY) / (row.count + 1);
                row.count += 1;
                placed = true;
                break;
            }
        }
        if (!placed)
            rows.push({ centerY, count: 1, nodes: [node] });
    }
    rows.sort((a, b) => a.centerY - b.centerY);
    rows.forEach((row) => row.nodes.sort((a, b) => a.x - b.x));
    const ordered = [];
    for (const row of rows)
        ordered.push(...row.nodes);
    return ordered;
}
// ---- Naming ---------------------------------------------------------
function pad(num, width) {
    const s = String(num);
    return s.length >= width ? s : "0".repeat(width - s.length) + s;
}
function sanitize(name) {
    return name.replace(/[\\/:*?"<>|]/g, "_").trim();
}
function buildName(opts, label, seq, originalName) {
    const sep = opts.separator; // defaults to "_"
    const s = pad(seq, opts.padding);
    let base = `${label}${sep}${s}`;
    if (opts.includeName)
        base += `${sep}${sanitize(originalName)}`;
    if (opts.locale)
        base = `${sanitize(opts.locale)}${sep}${base}`; // prefix with the locale
    return base;
}
// ---- Main process ---------------------------------------------------
figma.ui.onmessage = async (msg) => {
    if (msg.type === "cancel") {
        figma.closePlugin();
        return;
    }
    if (msg.type !== "export")
        return;
    const opts = msg.options;
    const nodes = getTargetNodes();
    if (nodes.length === 0) {
        figma.ui.postMessage({ type: "error", messageKey: "noTargets" });
        return;
    }
    const heights = nodes.map((n) => n.height).sort((a, b) => a - b);
    const medianH = heights[Math.floor(heights.length / 2)] || 0;
    const rowTolerance = opts.rowTolerance > 0 ? opts.rowTolerance : medianH * 0.5;
    const ordered = orderByCanvasPosition(nodes, rowTolerance);
    const ext = opts.format === "JPG" ? "jpg" : "png";
    const scale = 1; // always export at 1x
    const files = [];
    const warnings = [];
    const seqByLabel = {}; // per-family sequence counter
    try {
        for (const node of ordered) {
            let label = resolveLabel(node.width, node.height, scale);
            // If it doesn't match a standard size, warn and use the size itself as the label
            if (!label) {
                const w = Math.round(node.width * scale);
                const h = Math.round(node.height * scale);
                label = `UNKNOWN${Math.min(w, h)}x${Math.max(w, h)}`;
                warnings.push({ name: node.name, w, h });
            }
            const seq = (seqByLabel[label] || 0) + 1;
            seqByLabel[label] = seq;
            const settings = {
                format: opts.format,
                constraint: { type: "SCALE", value: scale },
            };
            const bytes = await node.exportAsync(settings);
            const name = buildName(opts, label, seq, node.name) + "." + ext;
            files.push({ name, bytes });
            figma.ui.postMessage({
                type: "progress",
                done: files.length,
                total: ordered.length,
            });
        }
        figma.ui.postMessage({ type: "files", files, warnings });
    }
    catch (e) {
        figma.ui.postMessage({
            type: "error",
            messageKey: "exportFailed",
            detail: String(e),
        });
    }
};
