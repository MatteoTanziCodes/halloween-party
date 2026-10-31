// Host dashboard. Polls /api/host/state every 2 seconds and renders the whole screen.
(function () {
  const { h, api, storage, avatar, clock, setAuth, qrSvg, renderScheduler, sheet } = MP;
  const root = document.getElementById('app');

  let pin = storage.get('mp_pin');
  let S = null;
  let lastJson = '';
  let skew = 0;
  let timer = null;
  let busy = false;
  let pinError = '';
  let loaded = false;
  const ui = { hide: true, help: false, queue: false, skipped: new Set(), modal: null, open: null };

  setAuth(() => (pin ? { 'X-Host-Pin': pin } : {}));
  const requestRender = renderScheduler(render);

  // ---- polling ----
  async function poll() {
    if (!pin) return;
    clearTimeout(timer);
    try {
      const data = await api('/api/host/state');
      skew = data.serverNow - Date.now();
      const json = JSON.stringify({ ...data, serverNow: 0 });
      S = data;
      document.title = S.title + ' · Host';
      if (!loaded) {
        loaded = true;
        if (!storage.get('mp_host_help_seen')) ui.help = true;
        lastJson = '';
      }
      if (json !== lastJson) {
        lastJson = json;
        requestRender();
      }
    } catch (e) {
      if (e.status === 401) {
        pin = null;
        storage.del('mp_pin');
        pinError = COPY.hostPinWrong;
        S = null;
        requestRender();
      }
    }
    if (!document.hidden) timer = setTimeout(poll, 2000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });

  async function act(path, body, method) {
    if (busy) return null;
    busy = true;
    try {
      const m = method || 'POST';
      return await api('/api/host/' + path, { method: m, body: m === 'GET' ? undefined : body || {} });
    } catch (e) {
      alert(e.message);
      return null;
    } finally {
      busy = false;
      lastJson = '';
      poll();
    }
  }

  // ---- helpers ----
  const nameOf = (id) => (S.players.find((p) => p.id === id) || { name: '?' }).name;
  const player = (id) => S.players.find((p) => p.id === id);
  const roleTag = (p) => {
    if (ui.hide || !p.role) return null;
    const r = p.power || p.role;
    return h('span', { class: 'tag ' + r }, COPY.roleName[r]);
  };
  function remainingMs() {
    return S && S.nightEndsAt ? S.nightEndsAt - (Date.now() + skew) : 0;
  }
  setInterval(() => {
    const c = document.getElementById('count');
    if (c && S && S.phase === 'night') c.textContent = remainingMs() > 0 ? clock(remainingMs()) : COPY.timeUp;
  }, 250);

  // Who dies if the night closes now, and whether the last slot is a coin flip.
  // The killers' top picks are chosen first; anyone an Exorcist protects then survives, with no replacement.
  function nightOutlook(counts, shielded) {
    const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || nameOf(a).localeCompare(nameOf(b)));
    const slots = S.victimsPerNight;
    const safe = (list) => list.filter((id) => !shielded.includes(id));
    if (ids.length <= slots) return { sure: safe(ids), tied: [] };
    const cut = counts[ids[slots - 1]];
    const above = ids.filter((id) => counts[id] > cut);
    const tied = ids.filter((id) => counts[id] === cut);
    return tied.length > slots - above.length
      ? { sure: safe(above), tied, open: slots - above.length }
      : { sure: safe(ids.slice(0, slots)), tied: [] };
  }

  // ---- photos ----
  async function squareJpeg(file) {
    const bmp = await decode(file);
    const w = bmp.width || bmp.naturalWidth;
    const hh = bmp.height || bmp.naturalHeight;
    const side = Math.min(w, hh);
    const c = document.createElement('canvas');
    c.width = c.height = 240;
    c.getContext('2d').drawImage(bmp, (w - side) / 2, (hh - side) / 2, side, side, 0, 0, 240, 240);
    return new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', 0.7));
  }

  async function decode(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    }
  }

  // Memes keep their shape (no square crop): longest side 900px, JPEG quality stepped down until it fits 400 KB.
  async function memeJpeg(file) {
    const bmp = await decode(file);
    const w = bmp.width || bmp.naturalWidth;
    const hh = bmp.height || bmp.naturalHeight;
    const scale = Math.min(1, 900 / Math.max(w, hh));
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(hh * scale);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; // transparent PNG memes would otherwise turn black
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const blob = await new Promise((resolve) => c.toBlob(resolve, 'image/jpeg', q));
      if (blob && blob.size <= 400 * 1024) return blob;
    }
    throw new Error(COPY.memeFailed);
  }

  function pickImage(id, kind) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Faces come from the camera; memes usually come from the camera roll.
    if (kind === 'photo') input.setAttribute('capture', 'environment');
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try {
        const blob = kind === 'photo' ? await squareJpeg(file) : await memeJpeg(file);
        await api('/api/host/player/' + id + '/' + kind, { method: 'POST', rawBody: blob, headers: { 'Content-Type': 'image/jpeg' } });
      } catch (e) {
        alert(e.message || (kind === 'photo' ? COPY.photoFailed : COPY.memeFailed));
      }
      lastJson = '';
      poll();
    };
    input.click();
  }
  const takePhoto = (id) => pickImage(id, 'photo');
  const addMeme = (id) => pickImage(id, 'meme');

  // ---- sheets ----
  function closeAll() {
    ui.help = false;
    ui.queue = false;
    ui.modal = null;
    storage.set('mp_host_help_seen', '1');
    requestRender();
  }

  function helpSheet() {
    return sheet(COPY.hostHelpTitle, [h('p', {}, COPY.hostHelp), h('button', { class: 'primary', onclick: closeAll }, COPY.helpClose)], closeAll);
  }

  function queueSheet() {
    const next = S.players
      .filter((p) => p.photoVersion === 0 && !ui.skipped.has(p.id))
      .sort((a, b) => b.joinedAt - a.joinedAt)[0];
    const close = h('button', { onclick: closeAll }, COPY.close);
    if (!next) return sheet(COPY.queueDone, [h('p', { class: 'hint' }, COPY.queueDoneHint), close], closeAll);
    return sheet(
      COPY.queueNext(next.name),
      [
        avatar(next, 120),
        h('p', { class: 'hint' }, COPY.queueHint),
        h('button', { class: 'primary', onclick: () => takePhoto(next.id) }, COPY.queueTake),
        h('div', { class: 'btnrow' }, h('button', { onclick: () => { ui.skipped.add(next.id); requestRender(); } }, COPY.queueSkip), close),
      ],
      closeAll,
    );
  }

  async function showRejoin(p) {
    const r = await act('player/' + p.id + '/rejoin', null, 'GET');
    if (!r) return;
    ui.modal = () => {
      const box = h('div', { class: 'qr', role: 'img', 'aria-label': 'Rejoin QR code' });
      box.innerHTML = qrSvg(r.url, 5);
      return sheet(
        COPY.rejoinTitle(p.name),
        [
          h('p', { class: 'hint' }, COPY.rejoinHint),
          h('div', { class: 'qrwrap' }, box),
          h('p', { class: 'small muted', style: 'word-break: break-all' }, r.url),
          h('button', { class: 'primary', onclick: closeAll }, COPY.close),
        ],
        closeAll,
      );
    };
    requestRender();
  }

  // ---- sections ----
  function pinScreen() {
    const input = h('input', { id: 'pin', type: 'password', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'go' });
    const go = () => {
      pin = input.value.trim();
      storage.set('mp_pin', pin);
      pinError = '';
      poll();
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    return [
      h('h1', { style: 'margin-top: var(--s-7)' }, COPY.hostPinTitle),
      h('p', { class: 'hint' }, COPY.hostPinHint),
      h('label', { class: 'field', for: 'pin' }, COPY.hostPinLabel),
      input,
      h('div', { class: 'err', role: 'alert' }, pinError),
      h('button', { class: 'primary', onclick: go }, COPY.hostPinButton),
    ];
  }

  function topbar() {
    const c = S.computed.status;
    const roundNum = S.phase === 'idle' ? Math.min(S.round + 1, S.totalRounds) : Math.max(S.round, 1);
    const line =
      S.phase === 'lobby'
        ? COPY.statusBefore(c.livingCount, c.killersLeft)
        : COPY.statusDuring(roundNum, S.totalRounds, c.livingCount, c.killersLeft) + ` · ${c.guestsLeft} guests`;
    return [
      h(
        'div',
        { class: 'topbar' },
        h('div', { style: 'min-width: 0' }, h('div', { class: 'phase' }, S.phase.toUpperCase()), h('div', { class: 'game' }, S.title)),
        h('button', { class: 'iconbtn', 'aria-label': COPY.hostHelpLabel, onclick: () => { ui.help = true; requestRender(); } }, '?'),
      ),
      h('div', { class: 'meta' }, line),
    ];
  }

  function lastVote() {
    const v = S.votes[S.votes.length - 1];
    return v && v.round === S.round ? v : null;
  }

  function doThisBox() {
    const t = COPY.doThis;
    let line = '';
    let warn = null;
    switch (S.phase) {
      case 'lobby':
      case 'idle':
      case 'morning':
      case 'vote':
      case 'ended':
        line = S.phase === 'vote' && S.computed.vote && S.computed.vote.tied.length ? t.voteTie : t[S.phase];
        break;
      case 'night':
        line = t.night;
        if (S.computed.night && S.computed.night.fewerThanThree) warn = t.nightWarn;
        break;
      case 'verdict': {
        const v = lastVote();
        line = v && v.eliminated ? t.verdict(nameOf(v.eliminated), player(v.eliminated).role === 'killer') : t.verdictNone;
        break;
      }
    }
    return h(
      'div',
      { class: 'dothis' },
      h('p', {}, h('span', { class: 'lead' }, COPY.doThisLabel + '. '), line),
      warn ? h('p', { class: 'warning' }, warn) : null,
    );
  }

  // What the host reads aloud sits above the button that moves the game on.
  function announce() {
    if (S.phase === 'morning' && S.computed.night) {
      const v = S.computed.night.victims;
      return h(
        'div',
        { class: 'announce' },
        v.length ? v.map((id) => h('div', { class: 'who' }, avatar(player(id), 72), h('div', { class: 'name' }, nameOf(id)))) : h('div', { class: 'name' }, COPY.victimsNone),
        S.computed.night.saved.length ? h('div', { class: 'note' }, COPY.savedNote(S.computed.night.saved.length)) : null,
      );
    }
    if (S.phase === 'verdict') {
      const lv = lastVote();
      if (!lv || !lv.eliminated) return h('div', { class: 'announce' }, h('div', { class: 'name' }, COPY.verdictNone));
      const p = player(lv.eliminated);
      return h(
        'div',
        { class: 'announce' },
        h('div', { class: 'who' }, avatar(p, 72), h('div', { class: 'name' }, COPY.verdictOutName(p.name))),
        h('div', { class: 'note' }, COPY.verdictWas(p.role === 'killer')),
      );
    }
    return null;
  }

  function primary() {
    const nodes = [];
    const P = COPY.primary;
    switch (S.phase) {
      case 'lobby':
        nodes.push(h('button', { class: 'primary', disabled: S.players.length < 4, onclick: () => act('start') }, P.lobby));
        if (S.players.length < 4) nodes.push(h('p', { class: 'small muted' }, COPY.needPlayers));
        break;
      case 'idle':
        nodes.push(h('button', { class: 'primary', onclick: () => act('open-night') }, P.idle));
        break;
      case 'night':
        nodes.push(h('button', { class: 'primary', onclick: () => act('close-night') }, P.night));
        nodes.push(h('div', { class: 'btnrow' }, h('button', { onclick: () => act('extend-night') }, COPY.extend)));
        break;
      case 'morning':
        nodes.push(h('button', { class: 'primary', onclick: () => act('open-vote') }, P.morning));
        break;
      case 'vote': {
        const v = S.computed.vote;
        if (v && v.tied.length) {
          nodes.push(
            h(
              'div',
              { class: 'stack' },
              h('button', { class: 'primary', onclick: () => act('revote') }, COPY.revote),
              h('button', { onclick: () => act('no-elimination') }, COPY.noElimination),
            ),
          );
        } else nodes.push(h('button', { class: 'primary', onclick: () => act('close-vote') }, P.vote));
        break;
      }
      case 'verdict':
        nodes.push(h('button', { class: 'primary', onclick: () => act('next-round') }, P.verdict));
        break;
    }
    if (S.undoLabel) {
      nodes.push(
        h(
          'button',
          {
            class: 'link',
            onclick: () => {
              let msg = COPY.undoConfirm(S.undoLabel);
              if (S.undoLabel === 'Start') msg += '\n\n' + COPY.undoStartWarn;
              if (confirm(msg)) act('undo');
            },
          },
          'Undo: ' + S.undoLabel,
        ),
      );
    }
    return nodes;
  }

  function phasePanel() {
    const out = [];
    const n = S.computed.night;
    if (S.phase === 'night' && n) {
      const rows = Object.entries(n.killerPicks).sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0])));
      const look = nightOutlook(n.killerPicks, n.protected);
      out.push(
        h(
          'div',
          { class: 'panel' },
          h('h3', {}, COPY.killerPicks(n.slotsFilled)),
          rows.length ? rows.map(([id, c]) => h('div', { class: 'tally' }, h('div', { class: 'line' }, h('span', {}, nameOf(id)), h('span', {}, String(c))))) : h('p', { class: 'muted' }, COPY.noPicksYet),
          look.sure.length ? h('p', {}, COPY.wouldDie(look.sure.map(nameOf).join(', '))) : null,
          look.tied.length ? h('p', { class: 'warning' }, COPY.tiedSlots(look.open, look.tied.map(nameOf).join(' / '))) : null,
          n.protected.length ? h('p', { class: 'muted' }, COPY.protectedLine(n.protected.map(nameOf).join(', '))) : null,
          n.powersTotal ? h('p', { class: 'muted small' }, COPY.powersActed(n.powersActed, n.powersTotal)) : null,
        ),
        h(
          'div',
          { class: 'panel' },
          h('h3', {}, COPY.suspectsTitle),
          n.suspicionTop5.length
            ? n.suspicionTop5.map((s) => h('div', { class: 'tally' }, h('div', { class: 'line' }, h('span', {}, nameOf(s.id)), h('span', {}, String(s.count)))))
            : h('p', { class: 'muted' }, COPY.noSuspects),
        ),
      );
    }
    const v = S.computed.vote;
    if (S.phase === 'vote' && v) {
      const total = v.votedCount + v.notVoted;
      const max = Math.max(1, ...Object.values(v.tally));
      const rows = Object.entries(v.tally).sort((a, b) => b[1] - a[1] || nameOf(a[0]).localeCompare(nameOf(b[0])));
      out.push(
        h(
          'div',
          { class: 'panel' },
          h('h3', {}, (v.isRevote ? 'Revote · ' : '') + COPY.voted(v.votedCount, total)),
          rows.map(([id, c]) =>
            h(
              'div',
              { class: 'tally' },
              h('div', { class: 'line' }, h('span', {}, nameOf(id)), h('span', {}, String(c))),
              h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${(c / max) * 100}%` })),
            ),
          ),
          v.tied.length ? h('p', { class: 'warning' }, COPY.tie(v.tied.map(nameOf).join(' / '))) : null,
        ),
      );
    }
    if (S.phase === 'ended' && S.reveal) out.push(...MP.renderReveal(S.reveal));
    return out;
  }

  function lobbyPanel() {
    if (S.phase !== 'lobby') return [];
    const joinUrl = location.origin + '/';
    const qr = h('div', { class: 'qr', role: 'img', 'aria-label': 'Join QR code' });
    qr.innerHTML = qrSvg(joinUrl, 6);
    const kc = S.computed;
    return [
      h('div', { class: 'qrwrap' }, qr, h('p', { class: 'muted small' }, joinUrl)),
      h(
        'div',
        { class: 'btnrow' },
        h('button', { onclick: () => window.open('/poster', '_blank') }, COPY.printPoster),
        h('button', { onclick: () => { ui.queue = true; requestRender(); } }, COPY.addPhotos),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', {}, COPY.titleLabel),
        h(
          'div',
          { class: 'setting' },
          h('div', { class: 'value' }, S.title),
          h('button', { class: 'small', onclick: () => { const t = prompt(COPY.titlePrompt, S.title); if (t) act('title', { title: t }); } }, COPY.rename),
        ),
      ),
      h(
        'div',
        { class: 'panel' },
        h('h3', {}, COPY.killersLabel),
        h(
          'div',
          { class: 'stepper' },
          h('button', { 'aria-label': 'Fewer killers', disabled: kc.killerCount <= 1, onclick: () => act('killer-count', { count: Math.max(1, kc.killerCount - 1) }) }, '−'),
          h('div', { class: 'keycount', 'aria-live': 'polite' }, String(kc.killerCount)),
          h('button', { 'aria-label': 'More killers', onclick: () => act('killer-count', { count: kc.killerCount + 1 }) }, '+'),
        ),
        h(
          'div',
          { class: 'setting' },
          h('span', { class: 'small muted' }, S.killerCountOverride === null ? COPY.killersAuto(kc.killerCountAuto) : COPY.killersOverride(kc.killerCountAuto)),
          S.killerCountOverride === null ? null : h('button', { class: 'link', onclick: () => act('killer-count', { count: null }) }, COPY.useAuto),
        ),
      ),
      h('div', { class: 'panel' }, h('h3', {}, COPY.powersLabel), h('p', { class: 'small muted' }, COPY.powersLine(kc.powerCounts))),
    ];
  }

  function playerRow(p) {
    const open = ui.open === p.id;
    const out = S.phase !== 'lobby' && !p.alive;
    return h(
      'div',
      { class: 'prow' + (out ? ' out' : '') + (open ? ' open' : '') },
      MP.holdForMeme(
        h(
          'button',
          { class: 'phead', 'aria-expanded': open ? 'true' : 'false', onclick: () => { ui.open = open ? null : p.id; requestRender(); } },
          avatar(p, 40),
          h('span', { class: 'pname' }, p.name),
          h('span', { class: 'ptags' }, roleTag(p), out ? h('span', { class: 'tag dead' }, COPY.deathTag[p.death] || p.death) : null),
          h('span', { class: 'chev', 'aria-hidden': 'true' }),
        ),
        p,
      ),
      open
        ? h(
            'div',
            { class: 'pacts' },
            h('button', { class: 'small', onclick: () => takePhoto(p.id) }, p.photoVersion ? COPY.retake : COPY.photo),
            h('button', { class: 'small', onclick: () => addMeme(p.id) }, p.memeVersion ? COPY.replaceMeme : COPY.meme),
            h('button', { class: 'small', onclick: () => showRejoin(p) }, COPY.rejoin),
            h('button', { class: 'small', onclick: () => { const nn = prompt(COPY.renamePrompt(p.name), p.name); if (nn) act('player/' + p.id + '/rename', { name: nn }); } }, COPY.rename),
            h('button', { class: 'small danger', disabled: S.phase === 'ended' || out, onclick: () => confirm(COPY.removeConfirm(p.name)) && act('player/' + p.id + '/remove') }, COPY.remove),
          )
        : null,
    );
  }

  function playerList() {
    return [
      h(
        'div',
        { class: 'sectionhead' },
        h('h2', {}, COPY.playersTitle(S.players.length)),
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: ui.hide ? true : null, onchange: (e) => { ui.hide = e.target.checked; requestRender(); } }), COPY.hideRoles),
      ),
      h('div', { class: 'plist' }, S.players.slice().sort((a, b) => a.name.localeCompare(b.name)).map(playerRow)),
    ];
  }

  function dangerZone() {
    return [
      h('h2', {}, COPY.dangerTitle),
      h(
        'div',
        { class: 'btnrow' },
        h('button', { class: 'danger', disabled: S.phase === 'lobby' || S.phase === 'ended', onclick: () => confirm(COPY.endConfirm) && act('end') }, COPY.endGame),
        h('button', { class: 'danger', onclick: () => { if (prompt(COPY.resetPrompt) === 'RESET') act('reset', { confirm: 'RESET' }); } }, COPY.reset),
      ),
    ];
  }

  function render() {
    if (pin && !S) {
      root.replaceChildren(h('p', { class: 'hint', style: 'margin-top: var(--s-6)' }, COPY.loading));
      return;
    }
    if (!pin) {
      root.replaceChildren(...pinScreen());
      return;
    }
    const scroll = window.scrollY;
    const nodes = [
      ...topbar(),
      S.phase === 'night' ? h('div', { id: 'count', class: 'count', role: 'timer' }, remainingMs() > 0 ? clock(remainingMs()) : COPY.timeUp) : null,
      doThisBox(),
      announce(),
      ...primary(),
      ...phasePanel(),
      ...lobbyPanel(),
      ...playerList(),
      ...dangerZone(),
    ].filter(Boolean);
    root.replaceChildren(...nodes);
    if (ui.help) root.append(helpSheet());
    else if (ui.queue) root.append(queueSheet());
    else if (ui.modal) root.append(ui.modal());
    window.scrollTo(0, scroll);
  }

  render();
  poll();
})();
