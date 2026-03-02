// =====================================================
// POPUP QUIZER - background.js (Service Worker)
// =====================================================

const API_KEY = "AIzaSyAI92pHa2AnlCCpXGXsYe1eS1REnfPNb2M";
const API_URL =
    "https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=" + API_KEY;

// Keep service worker alive while fetch is in progress
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type === "ASK_AI") {
        // Wake up the SW and do the work
        handleRequest(request, sendResponse);
        return true; // keep channel open
    }
});

function handleRequest(request, sendResponse) {
    askAI(request.question, request.options)
        .then(function (answer) {
            console.log('[PQ BG] AI returned:', answer);
            sendResponse({ ok: true, answer: answer });
        })
        .catch(function (err) {
            console.error('[PQ BG] Fetch error:', err.message);
            sendResponse({ ok: false, error: err.message });
        });
}

async function askAI(question, options) {
    // Label options A, B, C, D
    var labeled = options.map(function (o, i) {
        return String.fromCharCode(65 + i) + ") " + o;
    }).join("\n");

    var prompt =
        "Question: " + question + "\n\n" +
        "Options:\n" + labeled + "\n\n" +
        "Which option is correct? Reply with ONLY the single letter (A, B, C, or D). No punctuation, no explanation.";

    console.log('[PQ BG] Prompt:', prompt);

    var resp = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0, maxOutputTokens: 5 }
        })
    });

    var data = await resp.json();
    console.log('[PQ BG] Raw response:', JSON.stringify(data));

    if (!resp.ok) {
        throw new Error(data.error ? data.error.message : "HTTP " + resp.status);
    }

    var raw = data.candidates[0].content.parts[0].text.trim();
    console.log('[PQ BG] Raw text:', raw);

    var match = raw.match(/[A-Da-d]/);
    if (!match) throw new Error("Unexpected AI response: " + raw);
    return match[0].toUpperCase();
}
