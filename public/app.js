// Guest app. Polls /api/me and renders one screen per phase.
(function () {
  const { h, api, storage, avatar, clock, setAuth, checkIcon, renderScheduler, sheet } = MP;
  const root = document.getElementById('app');

  let token = null;
  let view = null;
  let title = COPY.defaultTitle;
  let skew = 0;
  let pollTimer = null;
  let inflight = false;
  let gen = 0; // bumped on every local change; poll responses from before it are discarded
  const ui = {
    done: false,
    helpOpen: false,
    picks: null, // optimistic local picks while saving
    vote: null,
    joinError: '',
    lost: false,
    lastPhase: null,
    holding: false,
    joining: false,
    wasOver: false,
  };
  let saving = false;
  let dirty = false;
  let votesInFlight = 0;
  let cardEl = null;
  let cardTimer = null;

  setAuth(() => (token ? { Authorization: 'Bearer ' + token } : {}));
  const requestRender = renderScheduler(render);
  requestRender.blockWhile(() => ui.holding);

  // ---- boot ----
  const params = new URLSearchParams(location.search);
  if (params.get('t')) {
    storage.set('mp_token', params.get('t'));
    history.replaceState(null, '', location.pathname);
  }
  token = storage.get('mp_token');

  function setTitle(t) {
    title = t || COPY.defaultTitle;
    document.title = title;
  }

  async function loadInfo() {
    try {
      const info = await api('/api/info');
      setTitle(info.title);
      if (!token && !info.joinable) ui.joinError = COPY.joinClosed;
      requestRender();
    } catch (e) {}
  }

  // ---- polling ----
  async function poll() {
    if (!token || inflight) return;
    inflight = true;
    const myGen = gen;
    try {
      const data = await api('/api/me?v=' + (view ? view.version : ''));
      if (myGen !== gen) return;
      if (data.serverNow) skew = data.serverNow - Date.now();
      if (data.unchanged) return; // nothing new: leave the screen alone
      view = data;
      setTitle(view.title);
      if (!saving) ui.picks = null;
      if (votesInFlight === 0) ui.vote = null;
      if (view.phase !== ui.lastPhase) {
        ui.done = false;
        ui.picks = null;
        ui.vote = null;
        ui.lastPhase = view.phase;
      }
      ui.wasOver = nightOver();
      requestRender();
    } catch (e) {
      if (e.status === 401) {
        token = null;
        storage.del('mp_token');
        view = null;
        ui.lost = true;
        requestRender();
      }
    } finally {
      inflight = false;
      schedule();
    }
  }

  function schedule() {
    clearTimeout(pollTimer);
    if (!token || document.hidden) return;
    // Between phases phones still check every few seconds, so night and voting open on every
    // phone within moments of the host tapping. Once the game is over there's nothing to wait for.
    let ms = 3000;
    if (view) {
      if (view.phase === 'night') ms = view.teamPicks ? 2000 : 3000;
      else if (view.phase === 'lobby') ms = 5000;
      else if (view.phase === 'ended') ms = 20000;
    }
    pollTimer = setTimeout(poll, ms);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
    else clearTimeout(pollTimer);
  });

  // ---- actions ----
  async function join(name) {
    if (ui.joining) return;
    ui.joining = true;
    ui.joinError = '';
    requestRender();
    try {
      const data = await api('/api/join', { method: 'POST', body: { name } });
      token = data.token;
      storage.set('mp_token', token);
      ui.lost = false;
      ui.helpOpen = !storage.get('mp_seen_help');
      ui.joining = false;
      await poll();
    } catch (e) {
      ui.joining = false;
      ui.joinError = e.message;
      requestRender();
    }
  }

  function selectedPicks() {
    return ui.picks || (view && view.myPicks) || [];
  }

  function togglePick(id) {
    if (nightOver()) return;
    const cur = [...selectedPicks()];
    const i = cur.indexOf(id);
    if (i >= 0) cur.splice(i, 1);
    else if (view.power) cur.splice(0, cur.length, id); // one choice: a new tap replaces it
    else if (cur.length < 3) cur.push(id);
    else return;
    ui.picks = cur;
    gen++;
    requestRender();
    savePicks();
  }

  async function savePicks() {
    if (saving) {
      dirty = true;
      return;
    }
    saving = true;
    try {
      do {
        dirty = false;
        try {
          await api('/api/pick', { method: 'POST', body: { targets: ui.picks || [] } });
        } catch (e) {
          if (e.status === 401) break;
          if (e.status === 409) {
            dirty = false;
            ui.picks = null;
            break;
          }
        }
      } while (dirty);
    } finally {
      saving = false;
      gen++;
      poll();
    }
  }

  async function castVote(id) {
    if (view && view.myVote === id && !ui.vote) return;
    ui.vote = id;
    gen++;
    votesInFlight++;
    requestRender();
    try {
      await api('/api/vote', { method: 'POST', body: { target: id } });
    } catch (e) {
      ui.vote = null;
    } finally {
      votesInFlight--;
      gen++;
      poll();
    }
  }

  // ---- time ----
  function remainingMs() {
    if (!view || !view.nightEndsAt) return 0;
    return view.nightEndsAt - (Date.now() + skew);
  }
  function nightOver() {
    return !!view && view.phase === 'night' && remainingMs() <= 0;
  }
  setInterval(() => {
    if (!view || view.phase !== 'night') return;
    const over = nightOver();
    if (over !== ui.wasOver) {
      ui.wasOver = over;
      requestRender(); // swap to the locked screen once, when the timer crosses zero
      return;
    }
    const c = document.getElementById('count');
    if (c) c.textContent = clock(remainingMs());
  }, 250);

  // ---- pieces ----
  function statusLine() {
    const s = view.status;
    const text =
      view.phase === 'lobby'
        ? COPY.statusBefore(s.livingCount, s.killersLeft)
        : COPY.statusDuring(
            view.phase === 'idle' ? Math.min(view.round + 1, view.totalRounds) : Math.max(view.round, 1),
            view.totalRounds,
            s.livingCount,
            s.killersLeft,
          );
    return h(
      'div',
      { class: 'statusline' },
      h('span', {}, text),
      h('button', { class: 'iconbtn', 'aria-label': COPY.helpLabel, onclick: openHelp }, '?'),
    );
  }

  function openHelp() {
    ui.helpOpen = true;
    requestRender();
  }
  function closeHelp() {
    ui.helpOpen = false;
    storage.set('mp_seen_help', '1');
    requestRender();
  }

  function helpSheet() {
    return sheet(
      COPY.helpTitle,
      [h('ol', {}, COPY.help.map((t) => h('li', {}, t))), h('button', { class: 'primary', onclick: closeHelp }, COPY.helpClose)],
      closeHelp,
    );
  }

  function roleCardNode() {
    const me = view.me;
    const team = view.teammates && view.teammates.length ? view.teammates.map((t) => t.name).join(', ') : COPY.cardKillerAlone;
    const found = view.findings || [];
    const kids = !me.role
      ? [h('p', {}, COPY.cardNoRole)]
      : [
          h('div', { class: 'card-role' }, COPY.cardRoleLine(me.role, me.power)),
          h('p', { class: 'state' }, me.alive ? COPY.cardAlive : COPY.cardDeath(me.death, me.diedRound)),
          h('p', {}, me.role === 'killer' ? COPY.cardKiller(team) : me.power ? COPY.cardPower[me.power] : COPY.cardGuest),
          found.length ? h('ul', { class: 'findings' }, found.map((f) => h('li', {}, COPY.finding(f)))) : null,
          me.alive ? null : h('p', {}, COPY.cardDeadTip),
        ];
    return h(
      'div',
      { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': COPY.cardLabel },
      h('div', { class: 'inner' }, h('div', { class: 'rolecard', role: 'status' }, kids)),
    );
  }

  function showCard() {
    if (!view || cardEl) return;
    ui.holding = true;
    cardEl = roleCardNode();
    document.body.append(cardEl);
    clearTimeout(cardTimer);
    cardTimer = setTimeout(hideCard, 5000);
  }
  function hideCard() {
    clearTimeout(cardTimer);
    if (cardEl) cardEl.remove();
    cardEl = null;
    if (ui.holding) {
      ui.holding = false;
      requestRender.flush();
    }
  }

  function roleButton() {
    if (!view.me.role) return null;
    const b = h('button', { class: 'hold' }, COPY.holdLabel);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      showCard();
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, hideCard);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    // Keyboard: hold Space or Enter.
    b.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        showCard();
      }
    });
    b.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') hideCard();
    });
    b.addEventListener('blur', hideCard);
    return b;
  }

  function person(p, o) {
    return MP.holdForMeme(row(p, o), p);
  }

  function row(p, o) {
    return h(
      'button',
      {
        class: 'row' + (o.sel ? ' sel' : '') + (o.dim ? ' dim' : '') + (o.locked ? ' locked' : ''),
        'aria-pressed': o.sel ? 'true' : 'false',
        'aria-disabled': o.locked || o.dim ? 'true' : null,
        onclick: o.onclick,
      },
      avatar(p, 52),
      h('span', { class: 'nm' }, p.name),
      o.num ? h('span', { class: 'num', 'aria-label': `${o.num} teammates picked` }, String(o.num)) : null,
      h('span', { class: 'chk' }, checkIcon()),
    );
  }

  // Identical shape and colour for every role; only the words differ.
  function summaryBox() {
    const s = view.summary;
    if (!s) return null;
    const killer = !!view.teamPicks;
    const items = s.items.length
      ? s.items.map((i, n) => [n ? ' · ' : '', i.name, killer ? h('span', { class: 'n' }, ' ' + i.count) : null])
      : COPY.noPicks;
    return h(
      'div',
      { class: 'panel summary' },
      h('h3', {}, s.title),
      h('div', { class: 'items' }, items),
      h('div', { class: 'note' }, s.warning || ''),
    );
  }

  // ---- screens ----
  function joinScreen() {
    const ua = navigator.userAgent || '';
    const weird = /Instagram|FBAN|FBAV|Snapchat|Line\/|; wv\)/i.test(ua);
    const input = h('input', {
      id: 'name',
      type: 'text',
      maxlength: '20',
      placeholder: COPY.joinPlaceholder,
      autocomplete: 'given-name',
      autocapitalize: 'words',
      enterkeyhint: 'go',
    });
    input.value = ui.name || '';
    input.addEventListener('input', () => (ui.name = input.value));
    const go = () => join(input.value);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    return [
      h('h1', { style: 'margin-top: var(--s-7)' }, title),
      h('p', { class: 'hint' }, COPY.joinHint),
      ui.lost ? h('p', { class: 'warning' }, COPY.lost) : null,
      weird ? h('p', { class: 'warning' }, COPY.weirdBrowserLoud) : null,
      h('label', { class: 'field', for: 'name' }, COPY.joinLabel),
      input,
      h('div', { class: 'err', role: 'alert' }, ui.joinError),
      h('button', { class: 'primary', onclick: go, disabled: ui.joining }, COPY.joinButton),
      weird ? null : h('p', { class: 'muted small' }, COPY.weirdBrowser),
      storage.persistent ? null : h('p', { class: 'warning small' }, COPY.noStorage),
    ];
  }

  function heading(key) {
    return [h('h1', {}, COPY.headings[key]), h('p', { class: 'hint' }, COPY.hints[key])];
  }

  function nightScreen() {
    const sel = selectedPicks();
    const over = nightOver();
    const mates = new Set((view.teammates || []).map((t) => t.id));
    const pw = view.power;
    const out = [];
    if (over) out.push(...heading('nightOver'));
    else if (ui.done) out.push(...heading('nightDone'));
    else if (pw) out.push(h('h1', {}, COPY.powerHeadings[pw.kind]), h('p', { class: 'hint' }, COPY.powerHint));
    else out.push(...heading('night'));
    if (!over) out.push(h('div', { id: 'count', class: 'count', role: 'timer', 'aria-live': 'off' }, clock(remainingMs())));
    out.push(summaryBox());
    if (ui.done && !over) {
      out.push(h('button', { class: 'link', onclick: () => { ui.done = false; requestRender(); } }, COPY.changePicks));
      return out;
    }
    if (pw && !pw.choices.length) out.push(h('p', { class: 'muted' }, COPY.noSpirits));
    const blocked = pw ? pw.blocked : null;
    out.push(
      h(
        'div',
        { class: 'list' },
        (pw ? pw.choices : view.living.filter((p) => p.id !== view.me.id)).map((p) =>
          person(p, {
            sel: sel.includes(p.id),
            dim: mates.has(p.id) || p.id === blocked,
            locked: over,
            num: view.teamPicks && view.teamPicks[p.id] ? view.teamPicks[p.id] : 0,
            onclick: () => !mates.has(p.id) && p.id !== blocked && togglePick(p.id),
          }),
        ),
      ),
    );
    if (!over) {
      out.push(h('p', { class: 'muted', role: 'status' }, COPY.selected(sel.length, pw ? 1 : 3)));
      out.push(h('button', { class: 'primary', onclick: () => { ui.done = true; window.scrollTo(0, 0); requestRender(); } }, COPY.done));
    }
    return out;
  }

  function voteScreen() {
    if (!view.me.alive) return heading('voteDead');
    const mine = ui.vote || view.myVote;
    const byId = new Map(view.living.map((p) => [p.id, p]));
    const cands = (view.candidates || []).map((id) => byId.get(id)).filter((p) => p && p.id !== view.me.id);
    return [
      ...heading('vote'),
      h('p', { class: 'yourvote', role: 'status' }, mine && byId.get(mine) ? COPY.voteYours(byId.get(mine).name) : COPY.voteNone),
      h('div', { class: 'list' }, cands.map((p) => person(p, { sel: p.id === mine, onclick: () => castVote(p.id) }))),
    ];
  }

  function mainScreen() {
    if (token && !view) return [h('p', { class: 'hint', style: 'margin-top: var(--s-6)' }, COPY.loading)];
    if (!token) return joinScreen();
    switch (view.phase) {
      case 'lobby':
        return [
          MP.holdForMeme(h('div', { class: 'me' }, avatar(view.me, 72), h('h1', {}, COPY.youreIn(view.me.name))), view.me),
          h('p', { class: 'hint' }, COPY.lobbyWait(view.status.livingCount)),
          h('p', { class: 'muted small' }, COPY.memeTip),
        ];
      case 'idle':
        return [...heading('idle'), roleButton(), h('p', { class: 'muted small' }, COPY.memeTip)];
      case 'night':
        return nightScreen();
      case 'morning':
        return [...heading('morning'), roleButton(), view.me.power ? h('p', { class: 'muted small' }, COPY.morningPower) : null];
      case 'vote':
        return voteScreen();
      case 'verdict':
        return [...heading('verdict'), roleButton()];
      case 'ended':
        return view.reveal ? MP.renderReveal(view.reveal) : [];
    }
    return [];
  }

  function render() {
    const scroll = window.scrollY;
    const focusedId = document.activeElement && document.activeElement.id;
    const nodes = [token && view ? statusLine() : null, ...[].concat(mainScreen())];
    root.replaceChildren(...nodes.filter(Boolean));
    if (ui.helpOpen) root.append(helpSheet());
    window.scrollTo(0, scroll);
    if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  }

  setTitle(title);
  render();
  if (token) poll();
  loadInfo();
})();
