// The end-of-game reveal, shown on every phone (and the host's) once the game is over.
(function () {
  const { h, avatar } = MP;

  function faces(people, max) {
    const shown = people.slice(0, max);
    const extra = people.length - shown.length;
    return h('div', { class: 'faces', 'aria-hidden': 'true' }, shown.map((p) => avatar(p, 48)), extra > 0 ? h('div', { class: 'more' }, '+' + extra) : null);
  }

  function renderReveal(R) {
    const by = new Map(R.players.map((p) => [p.id, p]));
    const P = (id) => by.get(id) || { id, name: '?', photoVersion: 0, role: null };
    const isK = (id) => P(id).role === 'killer';
    const names = (list) => list.map((e) => P(e.id).name).join(' & ');

    const out = [];
    out.push(h('h1', { class: 'win' }, COPY.reveal.winner(R.winner)));
    out.push(h('p', { class: 'hint' }, COPY.reveal.lead(R.killers.length)));

    out.push(h('h2', {}, COPY.reveal.killers(R.killers.length)));
    out.push(
      h(
        'div',
        { class: 'list' },
        R.killers.map((k) =>
          MP.holdForMeme(
            h('div', { class: 'row static' }, avatar(P(k.id), 52), h('span', { class: 'nm' }, P(k.id).name), h('span', { class: 'fate' }, k.fate)),
            P(k.id),
          ),
        ),
      ),
    );

    const A = R.awards;
    const awards = [
      ['bestDetective', (e) => COPY.reveal.detective(e.value)],
      ['fastestFall', (e) => COPY.reveal.fall(e.value)],
      ['mostSuspected', (e) => COPY.reveal.suspected(e.value)],
      ['deadliestKiller', (e) => COPY.reveal.deadliest(e.value)],
      ['teflon', (e) => COPY.reveal.teflon(e.value)],
    ].filter(([key]) => A[key] && A[key].length);
    if (awards.length) {
      out.push(h('h2', {}, COPY.reveal.awardsTitle));
      for (const [key, detail] of awards) {
        const list = A[key];
        const node = h(
          'div',
          { class: 'award' },
          faces(list.map((e) => P(e.id)), 3),
          h('div', { class: 'text' }, h('div', { class: 't' }, COPY.reveal.awardNames[key]), h('div', { class: 'n' }, names(list)), h('div', { class: 'd' }, detail(list[0]))),
        );
        // A single winner can be held for their meme; with a shared award it would be unclear whose.
        out.push(list.length === 1 ? MP.holdForMeme(node, P(list[0].id)) : node);
      }
    }

    out.push(h('h2', {}, COPY.reveal.roundsTitle));
    for (const r of R.rounds) {
      const trials = r.trials.map((t) => {
        const result = t.eliminated
          ? COPY.reveal.votedOut(P(t.eliminated).name, isK(t.eliminated))
          : t.tied.length
            ? COPY.reveal.tieNone
            : COPY.reveal.nobodyOut;
        return h(
          'div',
          {},
          h('p', {}, h('strong', {}, t.isRevote ? COPY.reveal.revote : COPY.reveal.trial), ' ', result),
          t.ballots.length
            ? h(
                'details',
                {},
                h('summary', {}, COPY.reveal.howVoted(t.ballots.length)),
                t.ballots.map((b) =>
                  h(
                    'div',
                    { class: 'ballot' },
                    avatar(P(b.voter), 28),
                    h('span', { class: isK(b.voter) ? 'k' : '' }, P(b.voter).name + (isK(b.voter) ? COPY.reveal.killerMark : '')),
                    h('span', { 'aria-hidden': 'true' }, '→'),
                    h('span', { class: 'visually-hidden' }, COPY.reveal.votedFor),
                    h('span', { class: isK(b.target) ? 'k' : '' }, P(b.target).name + (isK(b.target) ? COPY.reveal.killerMark : '')),
                  ),
                ),
              )
            : null,
        );
      });
      out.push(
        h(
          'section',
          { class: 'round' },
          h('h3', {}, COPY.reveal.round(r.round)),
          h('p', {}, h('strong', {}, COPY.reveal.murdered), ' ', r.victims.length ? r.victims.map((id) => P(id).name).join(', ') : COPY.reveal.nobody),
          trials,
        ),
      );
    }
    return out;
  }

  MP.renderReveal = renderReveal;
})();
