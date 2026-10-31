// Shared helpers for the guest, host and reveal pages.
(function () {
  const mem = {};
  let LS = null;
  try {
    localStorage.setItem('__mp', '1');
    localStorage.removeItem('__mp');
    LS = localStorage;
  } catch (e) {
    LS = null;
  }
  const storage = {
    persistent: !!LS,
    get(k) {
      try {
        if (LS) return LS.getItem(k);
      } catch (e) {}
      return k in mem ? mem[k] : null;
    },
    set(k, v) {
      try {
        if (LS) return LS.setItem(k, v);
      } catch (e) {}
      mem[k] = v;
    },
    del(k) {
      try {
        if (LS) LS.removeItem(k);
      } catch (e) {}
      delete mem[k];
    },
  };

  // Tiny DOM builder: h('div', {class:'x', onclick: fn}, child, 'text', ...)
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (c) => {
      if (c === null || c === undefined || c === false) return;
      if (Array.isArray(c)) return c.forEach(add);
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    };
    kids.forEach(add);
    return el;
  }

  let authFn = () => ({});
  function setAuth(fn) {
    authFn = fn;
  }

  async function api(path, opts) {
    const o = opts || {};
    const headers = Object.assign({}, authFn(), o.headers || {});
    let body;
    if (o.rawBody) {
      body = o.rawBody;
    } else if (o.body !== undefined) {
      body = JSON.stringify(o.body);
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(path, { method: o.method || 'GET', headers, body, cache: 'no-store' });
    let data = null;
    try {
      data = await res.json();
    } catch (e) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || 'Something went wrong.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function initials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const a = parts[0][0] || '';
    const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
  }

  // Pictures need the player's token or the host PIN, so <img src> can't be used; fetch a blob and cache it.
  // kind is 'photo' (the face from the door) or 'meme' (their costume meme).
  const photoCache = new Map(); // "kind:id:v" -> Promise<string|null>
  const photoUrls = new Map(); // "kind:id:v" -> objectURL once loaded
  function loadPhoto(id, v, kind) {
    const k = kind || 'photo';
    const key = k + ':' + id + ':' + v;
    if (!photoCache.has(key)) {
      photoCache.set(
        key,
        fetch('/api/' + k + '/' + id + '?v=' + v, { headers: authFn() })
          .then((r) => (r.ok ? r.blob() : null))
          .then((b) => {
            if (!b) throw new Error('no photo');
            const u = URL.createObjectURL(b);
            photoUrls.set(key, u);
            return u;
          })
          .catch(() => {
            photoCache.delete(key);
            return null;
          }),
      );
    }
    return photoCache.get(key);
  }
  function setBg(el, url) {
    el.style.backgroundImage = 'url(' + url + ')';
    el.textContent = '';
  }
  function avatar(p, size) {
    const s = size || 56;
    const el = h('div', { class: 'avatar', style: `width:${s}px;height:${s}px;font-size:${Math.round(s * 0.38)}px` }, initials(p.name));
    if (p.photoVersion > 0) {
      const cached = photoUrls.get('photo:' + p.id + ':' + p.photoVersion);
      if (cached) setBg(el, cached);
      else loadPhoto(p.id, p.photoVersion).then((u) => u && setBg(el, u));
    }
    return el;
  }

  function checkIcon() {
    const ns = 'http://www.w3.org/2000/svg';
    const s = document.createElementNS(ns, 'svg');
    s.setAttribute('viewBox', '0 0 16 16');
    s.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M3.5 8.5l3 3 6-7');
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.2');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
    return s;
  }

  function clock(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function qrSvg(text, cell) {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: cell || 6, margin: 0, scalable: true });
  }

  // Re-rendering replaces the DOM, so a tap that straddles a re-render would be lost. Hold renders while
  // a finger or mouse button is down, and flush shortly after release so the click lands first.
  function renderScheduler(renderFn) {
    let pressing = false;
    let pending = false;
    let blocked = () => false;
    document.addEventListener('pointerdown', () => (pressing = true), true);
    const release = () => {
      pressing = false;
      if (pending) setTimeout(flush, 60);
    };
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', release, true);
    function flush() {
      if (pressing || blocked()) return;
      if (!pending) return;
      pending = false;
      renderFn();
    }
    function request() {
      pending = true;
      flush();
    }
    request.blockWhile = (fn) => (blocked = fn);
    request.flush = flush;
    return request;
  }

  // An accessible full-screen sheet: labelled, focus moves in, Escape closes.
  function sheet(title, kids, onClose) {
    const id = 'sheet-' + Math.random().toString(36).slice(2, 8);
    const el = h(
      'div',
      { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
      h('div', { class: 'inner' }, h('h1', { id }, title), kids),
    );
    if (onClose) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') onClose();
      });
    }
    setTimeout(() => {
      const target = el.querySelector('button, input, a') || el;
      if (target === el) el.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }, 0);
    return el;
  }

  // ---- hold a name to see their meme ----
  // A long press (450 ms) on a name shows that person's meme until the finger lifts. A quick tap still
  // does whatever the row normally does, and a press that turns into a scroll is ignored.
  const HOLD_MS = 450;
  let swallowClickUntil = 0;
  document.addEventListener(
    'click',
    (e) => {
      if (Date.now() < swallowClickUntil) {
        e.stopImmediatePropagation();
        e.preventDefault();
      }
    },
    true,
  );

  let peekEl = null;
  function showMeme(p) {
    hideMeme();
    const img = h('img', { class: 'meme-img', alt: '' });
    const has = p.memeVersion > 0;
    peekEl = h(
      'div',
      { class: 'overlay peek', role: 'dialog', 'aria-modal': 'true', 'aria-label': COPY.memeLabel(p.name) },
      h(
        'div',
        { class: 'inner' },
        h('h1', {}, p.name),
        has ? h('div', { class: 'meme-frame' }, img) : h('div', { class: 'meme-none' }, avatar(p, 120), h('p', { class: 'hint' }, COPY.memeNone)),
      ),
    );
    document.body.append(peekEl);
    if (has) {
      const cached = photoUrls.get('meme:' + p.id + ':' + p.memeVersion);
      if (cached) img.src = cached;
      else loadPhoto(p.id, p.memeVersion, 'meme').then((u) => u && (img.src = u));
    }
  }
  function hideMeme() {
    if (peekEl) peekEl.remove();
    peekEl = null;
  }

  function holdForMeme(el, p) {
    let timer = null;
    let sx = 0;
    let sy = 0;
    let showing = false;
    const end = () => {
      clearTimeout(timer);
      timer = null;
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      if (showing) {
        showing = false;
        hideMeme();
        swallowClickUntil = Date.now() + 400; // the lift that ends a hold is not a tap
      }
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      sx = e.clientX;
      sy = e.clientY;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        showing = true;
        showMeme(p);
      }, HOLD_MS);
      window.addEventListener('pointerup', end, true);
      window.addEventListener('pointercancel', end, true);
    });
    el.addEventListener('pointermove', (e) => {
      if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) end();
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    return el;
  }

  window.MP = { storage, h, api, setAuth, initials, avatar, clock, qrSvg, checkIcon, renderScheduler, sheet, holdForMeme };
})();
