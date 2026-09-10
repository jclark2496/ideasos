/* ideasos — the launcher. Every idea is a markdown file in ideas/; index.json is the catalogue. A guide's steps carry
   `you:` (your page) and `agent:` (your agent's page, with check:, confirm: and report: lines pulled out); a guide with
   an agent page is also a skill, built into skills/<slug>/SKILL.md. Each kind has one verb: a guide installs, a how-to
   is sent to your agent, a note is opened. The prompt on the home is the search and understands the verbs. An idea you
   pick up is switched on, remembered in this browser. Beside a guide's steps sits an index of them that lights the one
   you are reading. window.App is the interface the tests use. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const view = $("view"), toast = $("toast"), root = document.documentElement, statusCounts = $("s-counts"), statusTheme = $("s-theme");
  const cache = new Map();
  let index = null, current = null, ready = false, loaded = false, observer = null, lastCopy = "";
  const state = { filter: "all", q: "", active: 0 };
  const KINDS = { guide: "Guide", howto: "How-to", note: "Note" };
  const VERB = { guide: "Install", howto: "Send to your agent", note: "" };

  // ---------- fetching ----------
  async function load(path) {
    if (!cache.has(path)) {
      const r = await fetch(path);
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      cache.set(path, await r.text());
    }
    return cache.get(path);
  }
  const absUrl = file => new URL(file, location.href).href;

  // ---------- a small markdown ----------
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${u}" rel="noopener">${t}</a>`);
    return s;
  }
  function md(src) {
    const lines = String(src).replace(/\r/g, "").split("\n");
    let out = "", i = 0;
    const block = /^(```|#{1,6}\s|[-*]\s|\d+\.\s|>)/;
    while (i < lines.length) {
      const l = lines[i];
      if (/^```/.test(l)) {
        const lang = l.slice(3).trim(), buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out += `<pre class="code" data-lang="${esc(lang)}"><code>${esc(buf.join("\n"))}</code></pre>`;
      } else if (/^#{1,6}\s/.test(l)) {
        const n = l.match(/^#+/)[0].length;
        out += `<h${n}>${inline(l.replace(/^#+\s*/, ""))}</h${n}>`; i++;
      } else if (/^>\s?/.test(l)) {
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
        out += `<blockquote>${md(buf.join("\n"))}</blockquote>`;
      } else if (/^[-*]\s+/.test(l)) {
        const buf = [];
        while (i < lines.length && /^[-*]\s+/.test(lines[i])) buf.push(lines[i++].replace(/^[-*]\s+/, ""));
        out += `<ul>${buf.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`;
      } else if (/^\d+\.\s+/.test(l)) {
        const buf = [];
        while (i < lines.length && /^\d+\.\s+/.test(lines[i])) buf.push(lines[i++].replace(/^\d+\.\s+/, ""));
        out += `<ol>${buf.map(x => `<li>${inline(x)}</li>`).join("")}</ol>`;
      } else if (!l.trim()) {
        i++;
      } else {
        const buf = [];
        while (i < lines.length && lines[i].trim() && !block.test(lines[i])) buf.push(lines[i++]);
        out += `<p>${inline(buf.join(" "))}</p>`;
      }
    }
    return out;
  }
  const plain = s => String(s).replace(/```\w*\n?/g, "").replace(/`/g, "").replace(/\*\*/g, "").trim();

  // ---------- the guide format ----------
  function front(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n?/), meta = {};
    if (m) for (const line of m[1].split("\n")) { const k = line.match(/^([\w-]+):\s*(.*)$/); if (k) meta[k[1]] = k[2].trim(); }
    return { meta, body: m ? text.slice(m[0].length) : text };
  }
  function person(rest) {
    const yi = rest.search(/^you:\s*$/m), ai = rest.search(/^agent:\s*$/m);
    if (yi >= 0) return rest.slice(yi + 4, ai > yi ? ai : undefined).trim();
    if (ai >= 0) return rest.slice(0, ai).trim();
    return rest.trim();
  }
  function agentOf(rest) {
    const ai = rest.search(/^agent:\s*$/m);
    if (ai < 0) return null;
    const agent = rest.slice(ai + 6).trim();
    if (!agent) return null;
    const checks = [], confirm = [], report = [], doLines = [];
    let fence = false;
    for (const line of agent.split("\n")) {
      if (/^```/.test(line)) fence = !fence;
      const k = !fence && line.match(/^(check|confirm|report):\s*(.*)$/);
      if (k) ({ check: checks, confirm, report })[k[1]].push(k[2]); else doLines.push(line);
    }
    const doMd = doLines.join("\n").trim();
    return { md: doMd, plain: plain(doMd), checks, confirm, report };
  }
  function parseGuide(text) {
    const { meta, body } = front(text);
    const chunks = body.split(/^## /m);
    const intro = person(chunks.shift().trim());
    const steps = chunks.map((chunk, idx) => {
      const nl = chunk.indexOf("\n"), head = chunk.slice(0, nl).trim();
      let rest = chunk.slice(nl + 1);
      const wires = [];
      rest = rest.replace(/^wire:\s*(.*)$/gm, (m, w) => { wires.push(...w.split(",").map(x => x.trim()).filter(Boolean)); return ""; });
      return { n: idx + 1, title: head.replace(/^\d+\.\s*/, ""), wires, you: person(rest), agent: agentOf(rest) };
    });
    return { meta, intro, steps };
  }

  // the reader reached step n: the step and its line in the index light up
  function activate(n) {
    state.active = n;
    for (const stp of view.querySelectorAll(".step")) stp.classList.toggle("is-active", +stp.dataset.step === n);
    for (const li of view.querySelectorAll(".index [data-step]")) { const s = +li.dataset.step; li.classList.toggle("is-active", s === n); li.classList.toggle("is-done", s < n); }
    const now = view.querySelector(".index .now");
    if (now && current && current.steps) now.textContent = `step ${n} of ${current.steps.length}`;
  }
  function watch() {
    if (observer) observer.disconnect();
    const steps = [...view.querySelectorAll(".step")]; if (!steps.length) return;
    observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).map(e => +e.target.dataset.step);
      if (visible.length) activate(Math.min(...visible));
    }, { rootMargin: "-20% 0px -55% 0px", threshold: 0 });
    steps.forEach(s => observer.observe(s));
  }

  // ---------- the verbs ----------
  const entryOf = slug => index.entries.find(e => e.slug === slug && e.status === "live");
  const installCmd = e => `mkdir -p .claude/skills/${e.slug} && curl -fsSL ${absUrl(e.skill)} -o .claude/skills/${e.slug}/SKILL.md`;
  // what to say to hand an idea over: a guide is walked, anything else is read
  const handoffText = e => e.agent
    ? `Fetch ${absUrl(e.file)} and follow the "agent:" block of each step, in order. Run every "check:" line before moving on and tell me the result in one line. Stop and ask me before any step with a "confirm:" line. Skip nothing, invent nothing, and start with step 1.`
    : `Read ${absUrl(e.file)} and keep it in mind for what we do next. Tell me in one line what it changes about how you'd approach the work.`;
  function stepText(n) {
    if (!current || current.kind !== "guide") return "";
    const s = current.steps[n - 1], m = current.meta;
    if (!s || !s.agent) return "";
    const url = location.href.split("#")[0] + "#/ideas/" + current.slug;
    const lines = [
      `You are helping me with "${m.title}" (${url}), step ${n} of ${current.steps.length}: ${s.title}.`,
      n > 1 ? `Steps 1 to ${n - 1} are done.` : `This is the first step.`, "", "Do this:", s.agent.plain,
    ];
    if (s.agent.confirm.length) lines.push("", `Ask me before you act on this: ${s.agent.confirm.join(" ")}`);
    if (s.agent.checks.length) lines.push("", "Before moving on, check:", ...s.agent.checks.map(c => `- ${c}`));
    if (s.agent.report.length) lines.push("", `When done, report: ${s.agent.report.join(" ")}`);
    return lines.join("\n");
  }
  async function copy(text, label) {
    lastCopy = text;
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select(); try { document.execCommand("copy"); } catch (e2) { /* nothing to do */ } ta.remove(); }
    say(label);
  }
  function say(msg) { toast.textContent = msg; toast.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { toast.hidden = true; }, 2400); }
  function decorate() {
    for (const pre of view.querySelectorAll("pre.code")) {
      if (pre.querySelector(".copy")) continue;
      const b = document.createElement("button"); b.type = "button"; b.className = "copy"; b.textContent = "copy"; b.dataset.copy = "code";
      pre.append(b);
    }
  }
  // the verb, done: install copies the line, send copies the handoff; both switch the idea on
  function doVerb(verb, slug) {
    const e = entryOf(slug); if (!e) { say(`No idea called ${slug}.`); return false; }
    if (verb === "install") {
      if (!e.skill) { say(`${e.title} is a ${KINDS[e.kind].toLowerCase()}; send it to your agent instead.`); return false; }
      copy(installCmd(e), `Copied the install line. Type /${e.slug} in Claude Code.`);
    } else if (verb === "send") {
      copy(handoffText(e), e.agent ? "Copied: hand this guide to your agent." : "Copied: send this to your agent.");
    } else if (verb === "open") { location.hash = `#/ideas/${slug}`; return true; }
    else return false;
    switchOn(slug, true);
    return true;
  }

  // ---------- switched on, remembered here ----------
  const onKey = "ideasos-on";
  function onList() { try { return JSON.parse(localStorage.getItem(onKey)) || []; } catch (e) { return []; } }
  function isOn(slug) { return onList().includes(slug); }
  function switchOn(slug, on) {
    const list = onList().filter(s => s !== slug); if (on) list.push(slug);
    try { localStorage.setItem(onKey, JSON.stringify(list)); } catch (e) { /* private mode */ }
    for (const c of view.querySelectorAll(`.card[data-slug="${slug}"]`)) {
      c.classList.toggle("on", on);
      const b = c.querySelector(".power"); if (b) { b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Switched on" : "Switch on"); }
    }
    paintStatus();
  }

  // ---------- theme ----------
  const themeKey = "ideasos-theme";
  function setTheme(which) {
    if (!["light", "dark", "system"].includes(which)) return;
    if (which === "system") delete root.dataset.theme; else root.dataset.theme = which;
    for (const b of document.querySelectorAll(".theme [data-theme]")) b.setAttribute("aria-pressed", String(b.dataset.theme === which));
    statusTheme.textContent = which === "system" ? "auto" : which;
    try { localStorage.setItem(themeKey, which); } catch (e) { /* fine */ }
  }
  function themeNow() { return root.dataset.theme || "system"; }

  // ---------- rendering ----------
  const version = v => v ? `v${v.replace(/-/g, ".")}` : "";
  const glyph = () => '<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7.4 6.4a8 8 0 1 0 9.2 0"/><path d="M12 2.8v9.4"/></svg>';
  const toolCard = id => { const t = index.tools[id]; return t ? `<li class="tool"><a href="${esc(t.url)}" rel="noopener">${esc(t.name)}</a><span>${esc(t.blurb)}</span></li>` : `<li class="tool"><a href="#">${esc(id)}</a></li>`; };
  function paintStatus() {
    if (!index) return;
    const live = index.entries.filter(e => e.status === "live"), on = onList().filter(s => entryOf(s)).length;
    statusCounts.innerHTML = `<span>${index.entries.length} ideas</span> · <span>${live.length} live</span> · <span>${live.filter(e => e.skill).length} installable</span> · <span class="lit" id="s-on">${on} switched on</span>`;
  }
  function verbButtons(e) {
    if (e.kind === "guide" && e.skill) return `<button class="btn primary" type="button" data-verb="install" data-slug="${esc(e.slug)}">Install</button>`;
    if (e.kind === "howto" || (e.kind === "guide" && !e.skill)) return `<button class="btn primary" type="button" data-verb="send" data-slug="${esc(e.slug)}">Send to your agent</button>`;
    return "";
  }
  function card(e) {
    const isLive = e.status === "live", href = `#/ideas/${e.slug}`, on = isLive && isOn(e.slug);
    return `<li class="card${isLive ? "" : " queued"}${on ? " on" : ""}" data-slug="${esc(e.slug)}" data-kind="${esc(e.kind)}">
      <p class="c-top"><span class="kind">${KINDS[e.kind]}</span>${e.time ? `<span>${esc(e.time)}</span>` : ""}${e.level ? `<span>${esc(e.level)}</span>` : ""}${isLive ? `<button class="power" type="button" data-power="${esc(e.slug)}" aria-pressed="${String(on)}" aria-label="${on ? "Switched on" : "Switch on"}">${glyph()}</button>` : ""}</p>
      ${isLive ? `<a class="c-title" href="${href}">${esc(e.title)}</a>` : `<span class="c-title">${esc(e.title)}</span>`}
      <p class="c-sum">${esc(e.summary)}</p>
      <p class="c-foot">${isLive ? `${verbButtons(e)}<a class="btn" href="${href}">Open</a><span class="ver">${version(e.verified)}</span>` : '<span class="q">in the queue</span>'}</p>
    </li>`;
  }
  function renderHome() {
    current = null; if (observer) observer.disconnect(); document.body.classList.add("is-home");
    view.innerHTML = `<section class="home">
      <h1>${esc(index.site.tagline)} Open source, for working with agents.</h1>
      <p class="stand">${esc(index.site.standfirst)}</p>
      <div class="prompt-row">
        <span class="key">os_<span class="cursor" aria-hidden="true"></span></span>
        <input id="q" type="search" value="${esc(state.q)}" placeholder="search, or: install doorman · send hallway · open claude-md" autocomplete="off" aria-label="Search, or a command" spellcheck="false">
        <span class="hint"><kbd>↵</kbd> run <kbd>⌘K</kbd> here</span>
      </div>
      <div class="filters" role="group" aria-label="Filter">${[["all", "All"], ["guide", "Guides"], ["howto", "How-tos"], ["note", "Notes"], ["on", "Switched on"]].map(([k, l]) => `<button type="button" data-filter="${k}" aria-pressed="${String(k === state.filter)}">${l}</button>`).join("")}</div>
      <ul class="cards" id="list" aria-label="Ideas"></ul>
      <p class="count" id="count"></p>
    </section>`;
    renderList();
  }
  function matches(e) {
    const f = state.filter, q = state.q.trim().toLowerCase();
    const byFilter = f === "all" || (f === "on" ? isOn(e.slug) : e.kind === f);
    return byFilter && (!q || `${e.slug} ${e.title} ${e.summary} ${e.parts}`.toLowerCase().includes(q));
  }
  function renderList() {
    if (!$("list")) return 0;
    const rows = index.entries.filter(matches), live = index.entries.filter(e => e.status === "live").length;
    $("list").innerHTML = rows.map(card).join("") || '<li class="empty">Nothing matches. Try a word from a title, or a command like install doorman.</li>';
    $("count").textContent = `${rows.length} of ${index.entries.length} · ${live} live, ${index.entries.length - live} in the queue`;
    for (const b of view.querySelectorAll("[data-filter]")) b.setAttribute("aria-pressed", String(b.dataset.filter === state.filter));
    return rows.length;
  }
  // the prompt: a command, or a search that opens its one match
  function run(line) {
    const m = line.trim().match(/^(install|send|open|help)(?:\s+([\w-]+))?$/i);
    if (m) {
      const verb = m[1].toLowerCase(), slug = m[2] ? m[2].toLowerCase() : "";
      if (verb === "help") { say("install <idea> · send <idea> · open <idea> · or just type to search"); return true; }
      if (!slug) { say(`${verb} what? Try: ${verb} doorman`); return false; }
      const ok = doVerb(verb, slug);
      if (ok && verb !== "open") { state.q = ""; const q = $("q"); if (q) q.value = ""; renderList(); }
      return ok;
    }
    state.q = line; const shown = renderList();
    const one = index.entries.filter(matches).filter(e => e.status === "live");
    if (one.length === 1 && shown === 1) { location.hash = `#/ideas/${one[0].slug}`; return true; }
    say(shown ? `${shown} ideas match.` : "Nothing matches."); return shown > 0;
  }

  function agentHtml(s, total) {
    const a = s.agent;
    if (!a) return '<p class="agent none">Nothing to delegate here; this one is yours.</p>';
    return `<div class="agent">
      <p class="a-head"><span>For your agent</span><span>step ${s.n} of ${total}</span></p>
      ${a.confirm.length ? `<p class="ask"><b>Ask first.</b> ${a.confirm.map(inline).join(" ")}</p>` : ""}
      <div class="do">${md(a.md)}</div>
      ${a.checks.length ? `<ul class="checks">${a.checks.map(c => `<li>${inline(c)}</li>`).join("")}</ul>` : ""}
      ${a.report.length ? `<p class="report"><b>Report.</b> ${a.report.map(inline).join(" ")}</p>` : ""}
      <button type="button" class="a-copy" data-copy="${s.n}">Copy step ${s.n} for your agent</button>
    </div>`;
  }
  function installHtml(e, g, skill) {
    const asks = g.steps.filter(s => s.agent && s.agent.confirm.length).length, checks = g.steps.reduce((n, s) => n + (s.agent ? s.agent.checks.length : 0), 0);
    return `<section class="install" aria-label="Install as a skill">
      <h2>Install as a skill</h2>
      <div class="cmd"><pre id="install-cmd"><span class="p">$</span>${esc(installCmd(e))}</pre><button class="i-copy" type="button" data-verb="install" data-slug="${esc(e.slug)}">Copy</button></div>
      <p class="then">Then type <code>/${esc(e.slug)}</code> in a Claude Code session on the machine that can reach your server, and it walks the guide: every check run, every ask-first step asked. <a href="${esc(absUrl(e.skill))}">The skill file</a> is generated from this guide — ${g.steps.length} steps, ${checks} checks, ${asks} ask first, ${(skill.length / 1024).toFixed(1)} KB — and never edited by hand.</p>
    </section>`;
  }
  const sideHtml = () => `<div class="toggle" role="radiogroup" aria-label="Which pages to show">
    ${[["both", "Both pages"], ["you", "For you"], ["agent", "For your agent"]].map(([k, l]) => `<button type="button" role="radio" data-side="${k}" aria-checked="${String(root.dataset.side === k)}">${l}</button>`).join("")}
  </div>`;
  function footHtml(e, m) {
    const lic = index.site.licence, repo = index.site.repo;
    return `<footer class="p-foot">
      <span><b>Open source.</b> Words ${esc(lic.words)} · code ${esc(lic.code)}</span>
      <a href="${esc(absUrl(e.file))}" data-act="markdown">${esc(e.slug)}.md</a>
      ${repo ? `<a href="${esc(repo)}/blob/main/${esc(e.file)}" rel="noopener">source</a><a href="${esc(repo)}/fork" rel="noopener">fork this idea</a>` : ""}
      <span class="right">verified ${esc(m.verified || e.verified || "")}</span>
    </footer>`;
  }
  function headHtml(e, m, extra) {
    const parts = (m.parts || "").split(",").map(s => s.trim()).filter(Boolean);
    return `<header class="p-head">
      <p class="p-top"><span class="kind">${KINDS[e.kind]}</span>${m.time ? `<span>${esc(m.time)}</span>` : ""}${m.level ? `<span>${esc(m.level)}</span>` : ""}<span class="ver">${version(e.verified)}</span>${m.verified ? `<span>${esc(m.verified.replace(/^\d{4}-\d{2}-\d{2}\s*·?\s*/, ""))}</span>` : ""}</p>
      <h1>${inline(m.title)}</h1>
      <p class="stand">${inline(m.summary)}</p>
      ${parts.length ? `<div class="parts"><h2>Requires</h2><ul class="tools">${parts.map(toolCard).join("")}</ul><p class="disclosure">${esc(index.site.disclosure)}</p></div>` : ""}
      <div class="actions">
        ${verbButtons(e)}
        ${e.kind === "guide" && e.skill ? `<button class="btn" type="button" data-verb="send" data-slug="${esc(e.slug)}">Send to your agent</button>` : ""}
        <a class="btn" href="${esc(absUrl(e.file))}" data-act="markdown">Markdown</a>
        ${m.pdf === "yes" ? '<button class="btn" type="button" data-act="pdf">Print / PDF</button>' : ""}
        ${m.repo ? `<a class="btn" href="${esc(m.repo)}" rel="noopener">Repository</a>` : ""}
      </div>
      ${extra || ""}
    </header>`;
  }
  async function renderGuide(e, g) {
    const m = g.meta, hasAgent = g.steps.some(s => s.agent);
    const skill = e.skill ? await load(e.skill) : "";
    current = { kind: e.kind, slug: e.slug, file: e.file, meta: m, steps: g.steps, skill, install: e.skill ? installCmd(e) : "" };
    view.innerHTML = `<article class="post">
      ${headHtml(e, m, e.skill ? installHtml(e, g, skill) : "")}
      ${hasAgent ? `<div class="controls">${sideHtml()}<span class="eyebrow">${g.steps.length} steps</span></div>` : ""}
      <div class="body">
        <div class="steps">
          <div class="intro">${md(g.intro)}</div>
          ${g.steps.map(s => `<section class="step" id="step-${s.n}" data-step="${s.n}">
            <h2 class="step-head"><span class="num">${String(s.n).padStart(2, "0")}</span><span>${inline(s.title)}</span></h2>
            <div class="you">${md(s.you)}</div>
            ${hasAgent ? agentHtml(s, g.steps.length) : ""}
          </section>`).join("")}
        </div>
        <aside class="index" aria-label="The steps">
          <h2>Steps</h2>
          <ol>${g.steps.map(s => `<li data-step="${s.n}"><button type="button" data-jump="${s.n}"><span class="num">${String(s.n).padStart(2, "0")}</span><span>${inline(s.title)}</span></button></li>`).join("")}</ol>
          <p class="now">${g.steps.length} steps</p>
        </aside>
      </div>
      ${footHtml(e, m)}
    </article>`;
    decorate(); watch();
  }
  function renderNote(e, text) {
    const { meta: m, body } = front(text);
    current = { kind: e.kind, slug: e.slug, file: e.file, meta: m, steps: [], skill: "", install: "" };
    view.innerHTML = `<article class="post">
      ${headHtml(e, m, "")}
      <div class="body single"><div class="note-body">${md(body)}</div></div>
      ${footHtml(e, m)}
    </article>`;
    decorate();
  }
  // a plain page's sections, listed beside it the way a guide's steps are
  function sectioned(copy) {
    let n = 0; const items = [];
    const html = copy.replace(/<h2>(.*?)<\/h2>/g, (m, title) => { n++; items.push({ n, title }); return `<h2 id="sec-${n}" data-sec="${n}">${title}</h2>`; });
    const index = `<aside class="index" aria-label="On this page"><h2>On this page</h2><ol>${items.map(i => `<li data-step="${i.n}"><button type="button" data-jump-sec="${i.n}"><span class="num">${String(i.n).padStart(2, "0")}</span><span>${i.title}</span></button></li>`).join("")}</ol><p class="now">${items.length} sections</p></aside>`;
    return `<div class="body"><div class="body-copy">${html}</div>${index}</div>`;
  }
  function watchSections() {
    if (observer) observer.disconnect();
    const heads = [...view.querySelectorAll(".body-copy h2[data-sec]")]; if (!heads.length) return;
    const light = n => { for (const li of view.querySelectorAll(".index [data-step]")) { const s = +li.dataset.step; li.classList.toggle("is-active", s === n); li.classList.toggle("is-done", s < n); } };
    observer = new IntersectionObserver(entries => { const seen = entries.filter(e => e.isIntersecting).map(e => +e.target.dataset.sec); if (seen.length) light(Math.min(...seen)); }, { rootMargin: "-10% 0px -70% 0px", threshold: 0 });
    heads.forEach(h => observer.observe(h));
    light(1);
  }
  function renderAgents() {
    current = null; if (observer) observer.disconnect();
    const live = index.entries.filter(e => e.status === "live"), first = live.find(e => e.agent) || live[0], skilled = live.filter(e => e.skill);
    view.innerHTML = `<section class="plain">
      <p class="eyebrow">For agents</p>
      <h1>Every idea has a twin your agent can read.</h1>
      ${sectioned(`
        <p>The pages here are built in the browser from plain markdown files. Those files are the agent's edition. A guide's steps carry an <code>agent:</code> block with <code>check:</code> lines and the <code>confirm:</code> lines that mean "ask your human first"; a how-to or a note is just the text. Point an agent at a file and it can follow along without you reading anything aloud.</p>
        <p>There is an index at <a href="${esc(absUrl("llms.txt"))}">llms.txt</a> that lists every file with one line about each, for agents that arrive at the site itself.</p>
        <h2>The twins</h2>
        <ul class="twins">${live.map(e => `<li><span>${esc(e.title)}</span><a href="${esc(absUrl(e.file))}">${esc(absUrl(e.file))}</a></li>`).join("")}</ul>
        <h2>What to say to your agent</h2>
        <p>Every idea has a button that copies the right sentence with the right address filled in. For a guide it is this:</p>
        <pre class="code" id="handoff-example">${esc(handoffText(first))}</pre>
        <p>For a single step of a guide, use the copy button on the step's agent panel. It carries the guide's name, the step number, what is already done, and the step's checks and confirmations, so the agent picks up mid-guide without being told where you are.</p>
        <h2>Or install it</h2>
        <p>A guide with an agent page is also a skill. A build step turns the agent side of every step into a <code>SKILL.md</code>, keeping the ask-first, check and report lines, and one line on the guide's page puts it where Claude Code looks. Then the guide's name, typed in a session, walks it.</p>
        <ul class="twins">${skilled.map(e => `<li><span>${esc(e.title)}</span><a href="${esc(absUrl(e.skill))}">${esc(absUrl(e.skill))}</a></li>`).join("")}</ul>
        <h2>The rules the agent side is written to</h2>
        <ul>
          <li>Do only what the step says; invent nothing.</li>
          <li>Run every check before moving on, and say what it printed.</li>
          <li>Stop before any step marked confirm. Those spend money, touch production, or need a human's finger.</li>
          <li>Report what the step asks for, in one line if possible.</li>
        </ul>
      `)}
    </section>`;
    decorate(); watchSections();
  }
  function renderAbout() {
    current = null; if (observer) observer.disconnect();
    const lic = index.site.licence;
    view.innerHTML = `<section class="plain">
      <p class="eyebrow">About</p>
      <h1>Open source ideas, and one verb each.</h1>
      ${sectioned(`
        <h2>Open source</h2>
        <p>ideasos is a small publication about working with agents. Every idea is one markdown file, published under a licence that lets you take it: the words are ${esc(lic.words)}, the code is ${esc(lic.code)}, and every page links its file, its source and a fork button. Nothing to sign up for.</p>
        <h2>Two readers</h2>
        <p>Every idea is written for two readers: you, and the agent in your other window. Your page is set in your theme. The agent's page, where there is one, is set in the other theme, with a button that copies it along with where you are.</p>
        <h2>Three kinds, three verbs</h2>
        <ul class="verbs">
          <li><span class="kind">Guide</span><b>Install</b><p>Steps with an agent page. One line puts a generated skill where Claude Code looks; the guide's name, typed in a session, walks it.</p></li>
          <li><span class="kind">How-to</span><b>Send to your agent</b><p>Steps or an explanation without an agent page. One line hands the file to your agent as context.</p></li>
          <li><span class="kind">Note</span><b>Open</b><p>A methodology, an opinion, something worth thinking about. Just read it.</p></li>
        </ul>
        <h2>Switched on</h2>
        <p>An idea you pick up is switched on: the glyph on its card lights, this browser remembers it, and the status bar counts it. That is all it means. It is a bookmark with a better name.</p>
        <h2>Verified with</h2>
        <p>When a tool is recommended it is because it is in use here. Every idea carries the date and the versions it was last verified with, because ideas about this rot in months, and a site that admits its age is the one worth trusting.</p>
      `)}
    </section>`;
    watchSections();
  }

  // ---------- routing ----------
  async function route() {
    loaded = false; document.body.classList.remove("is-home");
    const h = location.hash.replace(/^#\/?/, "").replace(/\/+$/, "");
    for (const a of document.querySelectorAll(".menu a")) a.removeAttribute("aria-current");
    try {
      if (!h) { renderHome(); mark("home"); }
      else if (h === "agents") { renderAgents(); mark("agents"); }
      else if (h === "about") { renderAbout(); mark("about"); }
      else if (/^ideas\/[\w-]+$/.test(h)) {
        const slug = h.split("/")[1], e = entryOf(slug);
        if (!e) throw new Error("no such idea");
        const text = await load(e.file);
        if (e.kind === "note") renderNote(e, text); else await renderGuide(e, parseGuide(text));
        mark("home");
      } else throw new Error("no such page");
    } catch (err) {
      current = null;
      view.innerHTML = `<section class="plain"><p class="eyebrow">Not here</p><h1>That idea isn't in the catalogue.</h1><div class="body-copy"><p><a href="#/">Back to the ideas.</a></p></div></section>`;
    }
    window.scrollTo(0, 0);
    paintStatus();
    loaded = true;
  }
  const mark = name => { const a = document.querySelector(`.menu a[data-nav="${name}"]`); if (a) a.setAttribute("aria-current", "page"); };
  function setSide(which) {
    if (!["both", "you", "agent"].includes(which)) return;
    root.dataset.side = which;
    for (const b of document.querySelectorAll(".toggle [data-side]")) b.setAttribute("aria-checked", String(b.dataset.side === which));
  }

  document.addEventListener("click", e => {
    const t = e.target.closest("[data-filter], [data-side], [data-copy], [data-verb], [data-power], [data-act], [data-jump], [data-jump-sec], .theme [data-theme]");
    if (!t) return;
    if (t.dataset.filter) { state.filter = t.dataset.filter; renderList(); }
    else if (t.dataset.jump) { const s = $(`step-${t.dataset.jump}`); if (s) { s.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); activate(+t.dataset.jump); } }
    else if (t.dataset.jumpSec) { const s = $(`sec-${t.dataset.jumpSec}`); if (s) s.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
    else if (t.dataset.side) setSide(t.dataset.side);
    else if (t.dataset.theme) setTheme(t.dataset.theme);
    else if (t.dataset.power) { const on = !isOn(t.dataset.power); switchOn(t.dataset.power, on); say(on ? "Switched on. This browser remembers it." : "Switched off."); }
    else if (t.dataset.copy === "code") copy(t.parentElement.querySelector("code").textContent, "Copied");
    else if (t.dataset.copy) copy(stepText(+t.dataset.copy), `Copied step ${t.dataset.copy} with its context`);
    else if (t.dataset.verb) { e.preventDefault(); doVerb(t.dataset.verb, t.dataset.slug); }
    else if (t.dataset.act === "pdf") { e.preventDefault(); window.print(); }
  });
  view.addEventListener("input", e => { if (e.target.id === "q") { state.q = e.target.value; renderList(); } });
  view.addEventListener("keydown", e => {
    if (e.target.id !== "q") return;
    if (e.key === "Enter") { e.preventDefault(); run(e.target.value); }
    else if (e.key === "Escape") { e.target.value = ""; state.q = ""; renderList(); }
  });
  addEventListener("keydown", e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { const q = $("q"); if (q) { e.preventDefault(); q.focus(); q.select(); } } });
  addEventListener("hashchange", route);

  // ---------- boot ----------
  root.dataset.side = "both";
  let savedTheme = "system"; try { savedTheme = localStorage.getItem(themeKey) || "system"; } catch (e) { /* fine */ }
  setTheme(savedTheme);
  load("index.json").then(text => { index = JSON.parse(text); ready = true; root.dataset.ready = "1"; return route(); })
    .catch(() => { view.innerHTML = '<p class="loading">The catalogue did not load. This page reads its ideas from files, so it needs to be served by a web server rather than opened from disk.</p>'; });

  window.App = {
    state: () => ({ ready, loaded, route: location.hash, kind: current ? current.kind : null, slug: current ? current.slug : null, steps: current ? current.steps.length : 0, active: state.active, side: root.dataset.side, theme: themeNow(),
      entries: index ? index.entries.length : 0, live: index ? index.entries.filter(e => e.status === "live").length : 0, shown: view.querySelectorAll(".card").length, filter: state.filter, q: state.q,
      on: onList(), agents: view.querySelectorAll(".step .agent:not(.none)").length, indexed: view.querySelectorAll(".index [data-step]").length, activeIndex: (view.querySelector(".index .is-active") || { dataset: {} }).dataset.step || null,
      install: current ? current.install : "", lastCopy }),
    go: h => { if (location.hash === h) route(); else location.hash = h; },
    run, activate, side: setSide, theme: setTheme, on: switchOn, stepText, handoff: slug => { const e = entryOf(slug || (current && current.slug)); return e ? handoffText(e) : ""; }, skill: () => current ? current.skill : "",
    filter: k => { state.filter = k; renderList(); }, search: q => { state.q = q; renderList(); },
  };
})();
