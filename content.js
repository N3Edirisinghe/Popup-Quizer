// =====================================================
// POPUP QUIZER - content.js
// Handles MCQ + Drag-and-Drop fill-in-the-blank
// =====================================================

(function () {
    'use strict';

    var API_KEY = "YOUR_GROQ_API_KEY_HERE";
    var API_URL = "https://api.groq.com/openai/v1/chat/completions";

    var activeSet = new Set();
    var cache = {};

    // ============================================================
    // DETECT QUESTION TYPE AND CONTAINER
    // Returns: { container, type: 'mcq'|'dragdrop'|null }
    // ============================================================

    function findQuizContainer(el) {
        // --- Moodle drag-and-drop / cloze types ---
        var que = el.closest('.que');
        if (que) {
            var isDragDrop =
                que.classList.contains('ddwtos') ||
                que.classList.contains('gapselect') ||
                que.classList.contains('multianswer') ||
                que.classList.contains('shortanswer') ||
                que.querySelector('.draghomes, .drop, select.select') !== null;
            if (isDragDrop) return { container: que, type: 'dragdrop' };
            // Regular Moodle MCQ
            return { container: que, type: 'mcq' };
        }

        // --- ARIA radiogroup (Google Forms, modern sites) ---
        var rg = el.closest('[role="radiogroup"], [role="group"]');
        if (rg && rg.querySelectorAll('[role="radio"],[role="checkbox"]').length >= 2)
            return { container: rg, type: 'mcq' };

        // --- Real radio/checkbox groups (walk up) ---
        var node = el;
        for (var i = 0; i < 10; i++) {
            if (!node || node === document.body) break;
            if (node.querySelectorAll('input[type="radio"],input[type="checkbox"]').length >= 2)
                return { container: node, type: 'mcq' };
            node = node.parentElement;
        }

        // --- Known quiz platform selectors ---
        var sel = '.quiz-question,.question,.question-block,.question-container,.question_holder,.display_question';
        var known = el.closest(sel);
        if (known) return { container: known, type: 'mcq' };

        return null;
    }

    // ============================================================
    // EXTRACT DATA
    // ============================================================

    function extractMCQ(container) {
        var question = '';
        var optionEls = [];

        // Moodle: ARIA: Generic
        var qEl = container.querySelector('.qtext,[role="heading"],h1,h2,h3,h4,h5,p,.question-text');
        question = (qEl || container).innerText.split('\n')[0].trim();

        // Options: ARIA
        var ariaOpts = container.querySelectorAll('[role="radio"],[role="checkbox"]');
        if (ariaOpts.length >= 2) { optionEls = Array.from(ariaOpts); }
        else {
            // Real radio inputs → get their labels
            var inputs = Array.from(container.querySelectorAll('input[type="radio"],input[type="checkbox"]'));
            if (inputs.length >= 2) {
                optionEls = inputs.map(function (inp) {
                    if (inp.id) {
                        var l = container.querySelector('label[for="' + inp.id + '"]');
                        if (l) return l;
                    }
                    return inp.closest('label') || inp.parentElement;
                }).filter(Boolean);
            } else {
                // Generic
                var cands = Array.from(container.querySelectorAll('.quiz-option,.option,.answer-option,.answer label,.choice,li'));
                optionEls = cands.filter(function (c) {
                    return c.innerText.trim().length > 0 &&
                        !cands.some(function (p) { return p !== c && p.contains(c); });
                }).slice(0, 8);
            }
        }
        return { question: question, optionEls: optionEls };
    }

    function extractDragDrop(container) {
        // Build paragraph text with blank placeholders [1], [2]...
        var qTextEl = container.querySelector('.qtext');
        var rawText = '';

        if (qTextEl) {
            // Clone and replace all blank elements with [N]
            var clone = qTextEl.cloneNode(true);
            var drops = clone.querySelectorAll(
                '.drop, select, input[type="text"], input.slot, span[class*="drop"], span[class*="blank"], span[class*="gap"]'
            );
            var n = 1;
            drops.forEach(function (d) { d.replaceWith('[' + (n++) + ']'); });
            rawText = clone.innerText.trim().replace(/\s+/g, ' ');
        } else {
            rawText = container.innerText.split('\n').slice(0, 10).join(' ');
        }

        // Word bank
        var wordEls = container.querySelectorAll('.draghome, .drag, option:not([value=""]), [class*="word-card"], [class*="draggable"]');
        var words = Array.from(wordEls)
            .map(function (el) { return el.innerText.trim(); })
            .filter(function (w) { return w.length > 0; });

        // Fallback: try select options
        if (words.length === 0) {
            container.querySelectorAll('select').forEach(function (sel) {
                Array.from(sel.options).forEach(function (o) {
                    if (o.value && o.text.trim()) words.push(o.text.trim());
                });
            });
        }

        return { rawText: rawText, words: [...new Set(words)] };
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    document.addEventListener('mouseenter', function (e) {
        if (!(e.target instanceof Element)) return;
        var result = findQuizContainer(e.target);
        if (!result) return;

        var container = result.container;
        if (activeSet.has(container)) return;

        if (result.type === 'dragdrop') {
            var dd = extractDragDrop(container);
            if (!dd.words.length) return;
            var cacheKey = dd.rawText.slice(0, 80);
            if (cache[cacheKey]) {
                activeSet.add(container);
                applyDragDropAnswers(container, cache[cacheKey]);
                return;
            }
            activeSet.add(container);
            showSpinner(container);
            callAPIDragDrop(container, dd.rawText, dd.words, cacheKey);
        } else {
            var mcq = extractMCQ(container);
            if (!mcq.optionEls || mcq.optionEls.length < 2) return;
            if (!mcq.question || mcq.question.length < 3) return;
            if (cache[mcq.question]) {
                activeSet.add(container);
                showSpinner(container);
                var cl = cache[mcq.question], co = mcq.optionEls;
                setTimeout(function () {
                    removeSpinner(container);
                    if (activeSet.has(container)) flash(co, cl);
                }, 150);
                return;
            }
            activeSet.add(container);
            showSpinner(container);
            callAPIMCQ(container, mcq.question, mcq.optionEls);
        }
    }, true);

    document.addEventListener('mouseleave', function (e) {
        if (!(e.target instanceof Element)) return;
        var result = findQuizContainer(e.target);
        if (!result) return;
        var container = result.container;
        var dest = e.relatedTarget;
        if (dest instanceof Element && container.contains(dest)) return;
        clearContainer(container);
    }, true);

    // ============================================================
    // UI HELPERS
    // ============================================================

    function showSpinner(container) {
        if (getComputedStyle(container).position === 'static')
            container.style.position = 'relative';
        if (!container.querySelector('[data-pq="spinner"]')) {
            var s = document.createElement('div');
            s.className = 'pq-spinner';
            s.setAttribute('data-pq', 'spinner');
            container.appendChild(s);
        }
    }

    function removeSpinner(container) {
        var s = container.querySelector('[data-pq="spinner"]');
        if (s) s.remove();
        if (container.style.position === 'relative') container.style.position = '';
    }

    function flash(optEls, letter) {
        optEls.forEach(function (el) { el.classList.remove('pq-flash'); });
        var idx = letter.toUpperCase().charCodeAt(0) - 65;
        if (idx >= 0 && idx < optEls.length) {
            void optEls[idx].offsetWidth;
            optEls[idx].classList.add('pq-flash');
            setTimeout(function () { optEls[idx].classList.remove('pq-flash'); }, 950);
        }
    }

    // Parse AI answer text "1: Word\n2: Word" → { 1: 'Word', 2: 'Word' }
    function parseAnswerMap(text) {
        var map = {};
        text.split(/\n/).forEach(function (line) {
            var m = line.match(/^(\d+)[:\.]\s*(.+)/);
            if (m) map[parseInt(m[1])] = m[2].trim();
        });
        return map;
    }

    // Place inline badges next to each blank + auto-fill selects
    function applyDragDropAnswers(container, answerMap) {
        // Remove old badges
        container.querySelectorAll('.pq-inline').forEach(function (b) { b.remove(); });

        // Find all blank elements in order
        var blanks = Array.from(container.querySelectorAll(
            '.qtext select, .qtext .drop, .qtext input[type="text"], ' +
            '.answer select, .formulation select, .content select'
        ));

        blanks.forEach(function (blank, i) {
            var num = i + 1;
            var word = answerMap[num];
            if (!word) return;
            // Auto-fill <select> dropdowns silently
            if (blank.tagName === 'SELECT') {
                Array.from(blank.options).forEach(function (opt) {
                    if (opt.text.trim().toLowerCase() === word.toLowerCase()) {
                        blank.value = opt.value;
                        blank.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
            }
        });

        // --- Number badges ON word bank chips ---
        // Build reverse map: lowercase word text → blank number
        var reverseMap = {};
        Object.keys(answerMap).forEach(function (num) {
            reverseMap[answerMap[num].toLowerCase()] = num;
        });

        // Find word bank chips (.draghome, .drag, or word-chip elements)
        var chips = Array.from(container.querySelectorAll(
            '.draghome, .drag, [class*="word-card"], [class*="draggable"], [class*="dragitem"]'
        ));

        chips.forEach(function (chip) {
            // Remove old number badge if any
            var oldNum = chip.querySelector('.pq-num');
            if (oldNum) oldNum.remove();

            var chipText = chip.innerText.trim().toLowerCase();
            var blankNum = reverseMap[chipText];
            if (!blankNum) return;

            // Add transparent number badge inside chip
            chip.style.position = 'relative';
            var numBadge = document.createElement('span');
            numBadge.className = 'pq-num';
            numBadge.textContent = blankNum;
            numBadge.style.cssText =
                'position:absolute;top:-8px;left:-8px;' +
                'background:rgba(231,76,60,0.55);color:#fff;border-radius:50%;' +
                'width:18px;height:18px;line-height:18px;text-align:center;' +
                'font-size:10px;font-weight:900;z-index:9999;' +
                'transition:opacity 0.35s ease;';
            chip.appendChild(numBadge);
            // Fade out after 1 second
            setTimeout(function () {
                numBadge.style.opacity = '0';
                setTimeout(function () { if (numBadge.parentNode) numBadge.remove(); }, 350);
            }, 1000);

        });
    }


    function clearContainer(container) {
        activeSet.delete(container);
        removeSpinner(container);
    }

    function showError(msg) {
        var old = document.getElementById('pq-err');
        if (old) old.remove();
        var t = document.createElement('div');
        t.id = 'pq-err';
        t.textContent = '⚠ ' + msg;
        t.style.cssText = 'position:fixed;bottom:12px;right:12px;padding:5px 10px;border-radius:6px;font-size:11px;z-index:99999;color:#fff;background:#c0392b;';
        document.body.appendChild(t);
        setTimeout(function () { if (t.parentNode) t.remove(); }, 4000);
    }

    // ============================================================
    // API CALLS
    // ============================================================

    async function callAPIMCQ(container, question, optEls) {
        var options = optEls.map(function (el) { return el.innerText.trim(); }).filter(Boolean);
        var labeled = options.map(function (o, i) { return String.fromCharCode(65 + i) + ') ' + o; }).join('\n');
        var prompt = 'Question: ' + question + '\n\nOptions:\n' + labeled +
            '\n\nReply with ONLY the single letter (A, B, C...) of the correct option. Nothing else.';
        try {
            // max_tokens=3 forces model to output only "A" or "B" etc.
            var data = await sendToGroq(prompt, 3);
            var raw = data.choices[0].message.content.trim().toUpperCase();
            // Extract FIRST letter in response (with 3-token limit it should just be the letter)
            var match = raw.match(/^([A-Z])/) || raw.match(/[A-Z]/);
            if (!match) throw new Error('Bad response: ' + raw);
            var letter = match[1] || match[0];
            cache[question] = letter;
            removeSpinner(container);
            if (activeSet.has(container)) flash(optEls, letter);
        } catch (err) {
            removeSpinner(container); activeSet.delete(container); showError(err.message);
        } finally { }
    }

    async function callAPIDragDrop(container, text, words, cacheKey) {

        // Count how many blanks [1],[2]... are in the text
        var blankCount = (text.match(/\[\d+\]/g) || []).length;

        var prompt =
            'You must fill in ALL ' + blankCount + ' numbered blanks [1] through [' + blankCount + ']' +
            ' using ONLY words from the word bank below.\n\n' +
            'Text with blanks:\n' + text + '\n\n' +
            'Word bank: ' + words.join(', ') + '\n\n' +
            'Rules:\n' +
            '- Fill EVERY blank from [1] to [' + blankCount + ']\n' +
            '- Use ONLY words from the word bank\n' +
            '- Output ONLY a numbered list, one per line:\n' +
            '1: Word\n2: Word\n...\n' + blankCount + ': Word';

        try {
            var data = await sendToGroq(prompt, 500);
            var answer = data.choices[0].message.content.trim();
            var answerMap = parseAnswerMap(answer);
            cache[cacheKey] = answerMap;
            removeSpinner(container);
            if (activeSet.has(container)) applyDragDropAnswers(container, answerMap);
        } catch (err) {
            removeSpinner(container); activeSet.delete(container); showError(err.message);
        } finally { }
    }

    // sendToGroq with auto-retry on rate limit (429)
    async function sendToGroq(prompt, maxTokens, retries) {
        if (retries === undefined) retries = 3;
        var resp = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + API_KEY },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a quiz solver. Be concise and accurate. Always answer ALL blanks.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0,
                max_tokens: maxTokens || 10
            })
        });
        var data = await resp.json();
        // Auto-retry on rate limit
        if (resp.status === 429 && retries > 0) {
            var wait = data.error && data.error.message.match(/try again in (\d+\.?\d*)s/i);
            var delay = wait ? parseFloat(wait[1]) * 1000 + 200 : 2500;
            await new Promise(function (r) { setTimeout(r, delay); });
            return sendToGroq(prompt, maxTokens, retries - 1);
        }
        if (!resp.ok) throw new Error(data.error ? data.error.message : 'HTTP ' + resp.status);
        return data;
    }

})();
