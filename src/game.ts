// Pure game logic: (state, action) -> new state. No Cloudflare imports.
import type {
  AwardEntry,
  GameState,
  HostComputed,
  HostView,
  Night,
  Player,
  PlayerView,
  RevealView,
  SummaryView,
  Vote,
  Winner,
} from './types';

export const TOTAL_ROUNDS = 5;
export const VICTIMS_PER_NIGHT = 3;
export const NIGHT_MS = 60_000;
export const EXTEND_MS = 30_000;
export const MIN_PLAYERS = 4;
export const MAX_NAME = 20;
export const MAX_TITLE = 40;
export const DEFAULT_TITLE = 'Murder on the Mews';

export const SUMMARY_TEAM_TITLE = 'Team picks right now';
export const SUMMARY_MINE_TITLE = 'Your picks';

export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GameError';
  }
}

export interface Ctx {
  now: number;
  rng: () => number; // [0, 1)
  hex: (bytes: number) => string;
}

export function systemCtx(now: number = Date.now()): Ctx {
  return {
    now,
    rng: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32,
    hex: (bytes) =>
      Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join(''),
  };
}

// ---- helpers ---------------------------------------------------------------

function edit(state: GameState, fn: (s: GameState) => void): GameState {
  const s = structuredClone(state);
  fn(s);
  s.version = state.version + 1;
  return s;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

function requirePhase(state: GameState, phase: GameState['phase'], what: string): void {
  if (state.phase !== phase) {
    throw new GameError(409, `Can't ${what} right now (the game is in "${state.phase}").`);
  }
}

function findPlayer(state: GameState, id: string): Player {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new GameError(404, 'No such player.');
  return p;
}

const living = (s: GameState) => s.players.filter((p) => p.alive);
const livingKillers = (s: GameState) => living(s).filter((p) => p.role === 'killer');
const livingGuests = (s: GameState) => living(s).filter((p) => p.role === 'guest');

function currentNight(s: GameState): Night | null {
  const n = s.nights[s.nights.length - 1];
  return n && n.round === s.round ? n : null;
}

function currentVote(s: GameState): Vote | null {
  const v = s.votes[s.votes.length - 1];
  return v && v.round === s.round ? v : null;
}

export function winnerNow(s: GameState): Winner | null {
  if (s.players.every((p) => p.role === null)) return null;
  const k = livingKillers(s).length;
  const g = livingGuests(s).length;
  if (k === 0) return 'guests';
  if (k >= g) return 'killers';
  return null;
}

function finalWinner(s: GameState): Winner {
  return winnerNow(s) ?? (livingKillers(s).length > 0 ? 'killers' : 'guests');
}

function finishIfWon(s: GameState): void {
  const w = winnerNow(s);
  if (w) {
    s.phase = 'ended';
    s.winner = w;
    s.nightEndsAt = null;
  }
}

export function defaultKillerCount(playerCount: number): number {
  return Math.max(1, Math.round(playerCount / 10));
}

export function killerCount(s: GameState): number {
  return s.killerCountOverride ?? defaultKillerCount(s.players.length);
}

function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') throw new GameError(400, 'Please enter a name.');
  // eslint-disable-next-line no-control-regex
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > MAX_NAME) {
    throw new GameError(400, `Name must be 1–${MAX_NAME} characters.`);
  }
  return name;
}

function nameTaken(s: GameState, name: string, exceptId?: string): boolean {
  const lower = name.toLowerCase();
  return s.players.some((p) => p.id !== exceptId && p.name.toLowerCase() === lower);
}

// ---- lobby -----------------------------------------------------------------

export function newGame(now: number, version = 0, title: string = DEFAULT_TITLE): GameState {
  return {
    version,
    title,
    phase: 'lobby',
    round: 0,
    totalRounds: TOTAL_ROUNDS,
    victimsPerNight: VICTIMS_PER_NIGHT,
    killerCountOverride: null,
    players: [],
    nights: [],
    votes: [],
    winner: null,
    createdAt: now,
    nightEndsAt: null,
    undoLabel: null,
  };
}

export function joinPlayer(
  state: GameState,
  rawName: unknown,
  ctx: Ctx,
): { state: GameState; token: string; playerId: string } {
  if (state.phase !== 'lobby') throw new GameError(409, "The game's already started. Enjoy the party!");
  const name = cleanName(rawName);
  if (nameTaken(state, name)) throw new GameError(409, "That name's taken, add your last initial.");
  let id = ctx.hex(4);
  while (state.players.some((p) => p.id === id)) id = ctx.hex(4);
  const token = ctx.hex(16);
  const next = edit(state, (s) => {
    s.players.push({
      id,
      token,
      name,
      role: null,
      alive: true,
      death: null,
      diedRound: null,
      joinedAt: ctx.now,
      photoVersion: 0,
      memeVersion: 0,
    });
  });
  return { state: next, token, playerId: id };
}

export function setKillerCount(state: GameState, count: unknown): GameState {
  requirePhase(state, 'lobby', 'change the killer count');
  if (count !== null && (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 50)) {
    throw new GameError(400, 'Killer count must be a whole number, 1 or more.');
  }
  return edit(state, (s) => {
    s.killerCountOverride = count as number | null;
  });
}

export function renamePlayer(state: GameState, id: string, rawName: unknown): GameState {
  findPlayer(state, id);
  const name = cleanName(rawName);
  if (nameTaken(state, name, id)) throw new GameError(409, "That name's taken.");
  return edit(state, (s) => {
    s.players.find((p) => p.id === id)!.name = name;
  });
}

export function bumpPhoto(state: GameState, id: string): GameState {
  findPlayer(state, id);
  return edit(state, (s) => {
    s.players.find((p) => p.id === id)!.photoVersion++;
  });
}

/** The host uploads a meme picture for each guest's costume; guests hold a name to see it. */
export function bumpMeme(state: GameState, id: string): GameState {
  findPlayer(state, id);
  return edit(state, (s) => {
    const p = s.players.find((x) => x.id === id)!;
    p.memeVersion = (p.memeVersion ?? 0) + 1;
  });
}

export function removePlayer(state: GameState, id: string): GameState {
  const p = findPlayer(state, id);
  if (state.phase === 'ended') throw new GameError(409, 'The game is over.');
  if (state.phase === 'lobby') {
    return edit(state, (s) => {
      s.players = s.players.filter((x) => x.id !== id);
    });
  }
  if (!p.alive) return state; // already out
  return edit(state, (s) => {
    const q = s.players.find((x) => x.id === id)!;
    q.alive = false;
    q.death = 'removed';
    q.diedRound = s.round;
    if (s.phase === 'night') {
      const n = currentNight(s);
      if (n) delete n.picks[id];
    }
    if (s.phase === 'vote') {
      const v = currentVote(s);
      if (v) {
        delete v.ballots[id];
        for (const [voter, target] of Object.entries(v.ballots)) if (target === id) delete v.ballots[voter];
        v.candidates = v.candidates.filter((c) => c !== id);
        v.tied = v.tied.filter((c) => c !== id);
      }
    }
    finishIfWon(s);
  });
}

// ---- host transitions ------------------------------------------------------

export type TransitionName =
  | 'start'
  | 'open-night'
  | 'close-night'
  | 'open-vote'
  | 'close-vote'
  | 'revote'
  | 'no-elimination'
  | 'next-round'
  | 'end';

export const UNDO_LABELS: Record<TransitionName, string> = {
  start: 'Start',
  'open-night': 'Open night',
  'close-night': 'Close night',
  'open-vote': 'Open vote',
  'close-vote': 'Close vote',
  revote: 'Revote',
  'no-elimination': 'No elimination',
  'next-round': 'Next round',
  end: 'End game',
};

export function isTransition(name: string): name is TransitionName {
  return name in UNDO_LABELS;
}

export function start(state: GameState, ctx: Ctx): GameState {
  requirePhase(state, 'lobby', 'start the game');
  const n = state.players.length;
  if (n < MIN_PLAYERS) throw new GameError(409, `Need at least ${MIN_PLAYERS} players to start (have ${n}).`);
  const k = killerCount(state);
  if (k >= n) throw new GameError(409, 'Too many killers for this many players.');
  const killers = new Set(shuffle(state.players.map((p) => p.id), ctx.rng).slice(0, k));
  return edit(state, (s) => {
    for (const p of s.players) p.role = killers.has(p.id) ? 'killer' : 'guest';
    s.phase = 'idle';
  });
}

export function openNight(state: GameState, ctx: Ctx): GameState {
  requirePhase(state, 'idle', 'open the night');
  return edit(state, (s) => {
    s.round += 1;
    s.nights.push({ round: s.round, picks: {}, victims: [], eligible: living(s).map((p) => p.id) });
    s.phase = 'night';
    s.nightEndsAt = ctx.now + NIGHT_MS;
  });
}

export function extendNight(state: GameState, now: number): GameState {
  requirePhase(state, 'night', 'add time');
  return edit(state, (s) => {
    s.nightEndsAt = Math.max(s.nightEndsAt ?? now, now) + EXTEND_MS;
  });
}

/** liveOnly: count picks by living killers on living guests (used to resolve the night). */
export function countKillerPicks(s: GameState, night: Night, liveOnly: boolean): Record<string, number> {
  const counts: Record<string, number> = {};
  const role = new Map(s.players.map((p) => [p.id, p]));
  for (const [pickerId, targets] of Object.entries(night.picks)) {
    const picker = role.get(pickerId);
    if (!picker || picker.role !== 'killer' || !night.eligible.includes(pickerId)) continue;
    if (liveOnly && !picker.alive) continue;
    for (const t of targets) {
      const target = role.get(t);
      if (!target || target.role !== 'guest') continue;
      if (liveOnly && !target.alive) continue;
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}

function suspicionCounts(s: GameState, night: Night): Record<string, number> {
  const counts: Record<string, number> = {};
  const byId = new Map(s.players.map((p) => [p.id, p]));
  for (const [pickerId, targets] of Object.entries(night.picks)) {
    const picker = byId.get(pickerId);
    if (!picker || picker.role !== 'guest' || !night.eligible.includes(pickerId)) continue;
    for (const t of targets) if (byId.has(t)) counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

export function closeNight(state: GameState, ctx: Ctx): GameState {
  requirePhase(state, 'night', 'close the night');
  return edit(state, (s) => {
    const night = currentNight(s)!;
    const counts = countKillerPicks(s, night, true);
    const cap = Math.min(s.victimsPerNight, livingGuests(s).length);
    const victims = shuffle(Object.keys(counts), ctx.rng)
      .sort((a, b) => counts[b] - counts[a]) // stable: random order survives among ties
      .slice(0, cap);
    night.victims = victims;
    for (const id of victims) {
      const p = s.players.find((x) => x.id === id)!;
      p.alive = false;
      p.death = 'murdered';
      p.diedRound = s.round;
    }
    s.phase = 'morning';
    s.nightEndsAt = null;
    finishIfWon(s);
  });
}

export function openVote(state: GameState): GameState {
  requirePhase(state, 'morning', 'open the vote');
  return edit(state, (s) => {
    s.votes.push({
      round: s.round,
      candidates: living(s).map((p) => p.id),
      ballots: {},
      isRevote: false,
      tied: [],
      eliminated: null,
    });
    s.phase = 'vote';
  });
}

export function tally(s: GameState, vote: Vote): Record<string, number> {
  const counts: Record<string, number> = {};
  const alive = new Set(living(s).map((p) => p.id));
  for (const c of vote.candidates) if (alive.has(c)) counts[c] = 0;
  for (const [voter, target] of Object.entries(vote.ballots)) {
    if (alive.has(voter) && target in counts) counts[target]++;
  }
  return counts;
}

export function closeVote(state: GameState): GameState {
  requirePhase(state, 'vote', 'close the vote');
  if (currentVote(state)!.tied.length > 0) {
    throw new GameError(409, "It's a tie. Choose Revote or No elimination.");
  }
  return edit(state, (s) => {
    const vote = currentVote(s)!;
    const counts = tally(s, vote);
    const max = Math.max(0, ...Object.values(counts));
    if (max === 0) {
      s.phase = 'verdict';
      return;
    }
    const top = Object.keys(counts).filter((id) => counts[id] === max);
    if (top.length > 1) {
      vote.tied = top;
      if (vote.isRevote) s.phase = 'verdict'; // a second tie means no elimination
      return;
    }
    const p = s.players.find((x) => x.id === top[0])!;
    p.alive = false;
    p.death = 'voted';
    p.diedRound = s.round;
    vote.eliminated = p.id;
    s.phase = 'verdict';
    finishIfWon(s);
  });
}

export function revote(state: GameState): GameState {
  requirePhase(state, 'vote', 'start a revote');
  const vote = currentVote(state)!;
  if (vote.tied.length === 0 || vote.isRevote) throw new GameError(409, "There's no tie to revote.");
  const alive = new Set(living(state).map((p) => p.id));
  const tied = vote.tied.filter((id) => alive.has(id));
  if (tied.length < 2) throw new GameError(409, 'Not enough tied players left. Choose No elimination.');
  return edit(state, (s) => {
    s.votes.push({ round: s.round, candidates: tied, ballots: {}, isRevote: true, tied: [], eliminated: null });
  });
}

export function noElimination(state: GameState): GameState {
  requirePhase(state, 'vote', 'skip the elimination');
  if (currentVote(state)!.tied.length === 0) throw new GameError(409, "There's no tie to skip.");
  return edit(state, (s) => {
    s.phase = 'verdict';
  });
}

export function nextRound(state: GameState): GameState {
  requirePhase(state, 'verdict', 'start the next round');
  return edit(state, (s) => {
    if (s.round >= s.totalRounds) {
      s.phase = 'ended';
      s.winner = finalWinner(s);
      s.nightEndsAt = null;
    } else {
      s.phase = 'idle';
    }
  });
}

export function endGame(state: GameState): GameState {
  if (state.phase === 'lobby') throw new GameError(409, "The game hasn't started yet.");
  if (state.phase === 'ended') throw new GameError(409, 'The game is already over.');
  return edit(state, (s) => {
    s.phase = 'ended';
    s.winner = finalWinner(s);
    s.nightEndsAt = null;
  });
}

export function applyTransition(state: GameState, name: TransitionName, ctx: Ctx): GameState {
  let next: GameState;
  switch (name) {
    case 'start':
      next = start(state, ctx);
      break;
    case 'open-night':
      next = openNight(state, ctx);
      break;
    case 'close-night':
      next = closeNight(state, ctx);
      break;
    case 'open-vote':
      next = openVote(state);
      break;
    case 'close-vote':
      next = closeVote(state);
      break;
    case 'revote':
      next = revote(state);
      break;
    case 'no-elimination':
      next = noElimination(state);
      break;
    case 'next-round':
      next = nextRound(state);
      break;
    case 'end':
      next = endGame(state);
      break;
  }
  return { ...next, undoLabel: UNDO_LABELS[name] };
}

export function undo(current: GameState, snapshot: GameState | null): GameState {
  if (!snapshot || !current.undoLabel) throw new GameError(409, 'Nothing to undo.');
  return { ...structuredClone(snapshot), version: current.version + 1, undoLabel: null };
}

export function resetGame(state: GameState, confirm: unknown, now: number): GameState {
  if (confirm !== 'RESET') throw new GameError(400, 'Type RESET to confirm.');
  // The title is the host's setup, not game state, so it survives a reset.
  return newGame(now, state.version + 1, gameTitle(state));
}

/** Older saved games predate the title field. */
export function gameTitle(state: GameState): string {
  return state.title || DEFAULT_TITLE;
}

export function setTitle(state: GameState, raw: unknown): GameState {
  if (typeof raw !== 'string') throw new GameError(400, 'Please enter a title.');
  // eslint-disable-next-line no-control-regex
  const title = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (title.length < 1 || title.length > MAX_TITLE) {
    throw new GameError(400, `Title must be 1–${MAX_TITLE} characters.`);
  }
  return edit(state, (s) => {
    s.title = title;
  });
}

// ---- player actions ----------------------------------------------------------

export function pick(state: GameState, playerId: string, targets: unknown, now: number): GameState {
  requirePhase(state, 'night', 'pick names');
  if (state.nightEndsAt !== null && now >= state.nightEndsAt) {
    throw new GameError(409, "Night's over. Picks locked.");
  }
  if (!Array.isArray(targets) || targets.some((t) => typeof t !== 'string')) {
    throw new GameError(400, 'Pick up to 3 names.');
  }
  const unique = [...new Set(targets as string[])];
  if (unique.length > state.victimsPerNight) throw new GameError(400, 'Pick up to 3 names.');
  const me = findPlayer(state, playerId);
  const alive = new Map(living(state).map((p) => [p.id, p]));
  let accepted: string[];
  if (!me.alive) {
    // Dead players' taps look normal on their phone but never count (they aren't in night.eligible).
    accepted = unique.filter((t) => t !== me.id && alive.has(t));
  } else {
    for (const t of unique) {
      const target = alive.get(t);
      if (!target) throw new GameError(400, "You can't pick that player.");
      if (t === me.id) throw new GameError(400, "You can't pick yourself.");
      if (me.role === 'killer' && target.role === 'killer') throw new GameError(400, "You can't pick a teammate.");
    }
    accepted = unique;
  }
  return edit(state, (s) => {
    currentNight(s)!.picks[me.id] = accepted;
  });
}

export function castVote(state: GameState, voterId: string, target: unknown): GameState {
  requirePhase(state, 'vote', 'vote');
  const vote = currentVote(state)!;
  if (vote.tied.length > 0) throw new GameError(409, 'Voting is closed. Listen to the host.');
  const voter = findPlayer(state, voterId);
  if (!voter.alive) throw new GameError(409, "You're dead, so you can't vote.");
  if (typeof target !== 'string' || !vote.candidates.includes(target)) {
    throw new GameError(400, "That's not someone you can vote for.");
  }
  if (target === voterId) throw new GameError(400, "You can't vote for yourself.");
  if (!state.players.find((p) => p.id === target)!.alive) throw new GameError(400, "That's not someone you can vote for.");
  return edit(state, (s) => {
    currentVote(s)!.ballots[voterId] = target;
  });
}

// ---- views -------------------------------------------------------------------

function statusLine(s: GameState): { livingCount: number; killersLeft: number } {
  if (s.phase === 'lobby') return { livingCount: s.players.length, killersLeft: killerCount(s) };
  return { livingCount: living(s).length, killersLeft: livingKillers(s).length };
}

function buildSummary(s: GameState, me: Player, night: Night): SummaryView {
  const name = (id: string) => s.players.find((p) => p.id === id)?.name ?? '?';
  if (me.role === 'killer' && me.alive) {
    const counts = countKillerPicks(s, night, true);
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || name(a).localeCompare(name(b)));
    const top = sorted.slice(0, s.victimsPerNight);
    let warning: string | null = null;
    if (sorted.length < s.victimsPerNight) {
      warning = `Only ${sorted.length} picked so far.`;
    } else {
      const c = counts[top[top.length - 1]];
      const group = sorted.filter((id) => counts[id] === c);
      const slots = top.filter((id) => counts[id] === c).length;
      if (group.length > slots) {
        warning =
          slots === 1
            ? `Tied for 3rd: ${group.map(name).join(' / ')}. Agree on one.`
            : `Tied for the last ${slots} spots: ${group.map(name).join(' / ')}. Agree on ${slots}.`;
      }
    }
    return { title: SUMMARY_TEAM_TITLE, items: top.map((id) => ({ id, name: name(id), count: counts[id] })), warning };
  }
  const mine = night.picks[me.id] ?? [];
  return {
    title: SUMMARY_MINE_TITLE,
    items: mine.map((id) => ({ id, name: name(id), count: 1 })),
    warning: null,
  };
}

export function playerByToken(state: GameState, token: string | null | undefined): Player | null {
  if (!token) return null;
  return state.players.find((p) => p.token === token) ?? null;
}

export function playerToken(state: GameState, id: string): string {
  return findPlayer(state, id).token;
}

export function playerView(state: GameState, playerId: string, now: number): PlayerView {
  const me = findPlayer(state, playerId);
  const isKiller = me.role === 'killer';
  const night = state.phase === 'night' ? currentNight(state) : null;
  const vote = state.phase === 'vote' ? currentVote(state) : null;
  const alive = new Set(living(state).map((p) => p.id));
  return {
    version: state.version,
    title: gameTitle(state),
    phase: state.phase,
    round: state.round,
    totalRounds: state.totalRounds,
    me: {
      id: me.id,
      name: me.name,
      alive: me.alive,
      role: me.role,
      death: me.death,
      diedRound: me.diedRound,
      photoVersion: me.photoVersion,
      memeVersion: me.memeVersion ?? 0,
    },
    living: living(state)
      .slice()
      .sort(byName)
      .map((p) => ({ id: p.id, name: p.name, photoVersion: p.photoVersion, memeVersion: p.memeVersion ?? 0 })),
    myPicks: night ? (night.picks[me.id] ?? []) : [],
    myVote: vote ? (vote.ballots[me.id] ?? null) : null,
    candidates: vote
      ? living(state)
          .filter((p) => vote.candidates.includes(p.id))
          .sort(byName)
          .map((p) => p.id)
      : null,
    teammates: isKiller
      ? state.players.filter((p) => p.role === 'killer' && p.id !== me.id).map((p) => ({ id: p.id, name: p.name }))
      : null,
    teamPicks: isKiller && me.alive && night ? countKillerPicks(state, night, true) : null,
    summary: night ? buildSummary(state, me, night) : null,
    nightEndsAt: state.nightEndsAt,
    serverNow: now,
    status: statusLine(state),
    winner: state.winner,
    reveal: state.phase === 'ended' ? buildReveal(state) : null,
  };
}

export function getMe(
  state: GameState,
  token: string | null | undefined,
  knownVersion: number | null,
  now: number,
): PlayerView | { unchanged: true } | null {
  const me = playerByToken(state, token);
  if (!me) return null;
  if (knownVersion !== null && knownVersion === state.version) return { unchanged: true };
  return playerView(state, me.id, now);
}

function topBy(entries: AwardEntry[], mode: 'max' | 'min'): AwardEntry[] {
  if (entries.length === 0) return [];
  const best = mode === 'max' ? Math.max(...entries.map((e) => e.value)) : Math.min(...entries.map((e) => e.value));
  if (mode === 'max' && best <= 0) return [];
  return entries.filter((e) => e.value === best);
}

export function buildReveal(s: GameState): RevealView {
  const byId = new Map(s.players.map((p) => [p.id, p]));
  const guests = s.players.filter((p) => p.role === 'guest');
  const killers = s.players.filter((p) => p.role === 'killer');

  const votesFor: Record<string, number> = {};
  const detective: Record<string, number> = {};
  for (const v of s.votes) {
    for (const [voter, target] of Object.entries(v.ballots)) {
      votesFor[target] = (votesFor[target] ?? 0) + 1;
      if (byId.get(voter)?.role === 'guest' && byId.get(target)?.role === 'killer') {
        detective[voter] = (detective[voter] ?? 0) + 1;
      }
    }
  }

  // Fastest Fall: earliest voted-out guest; ties in the same round go to the one with most votes against them.
  const fallen = guests
    .filter((p) => p.death === 'voted')
    .map((p) => {
      const v = s.votes.find((x) => x.eliminated === p.id);
      return { id: p.id, round: p.diedRound ?? 99, against: v ? Object.values(v.ballots).filter((t) => t === p.id).length : 0 };
    })
    .sort((a, b) => a.round - b.round || b.against - a.against);
  const fastestFall: AwardEntry[] = fallen.length
    ? fallen.filter((f) => f.round === fallen[0].round && f.against === fallen[0].against).map((f) => ({ id: f.id, value: f.round }))
    : [];

  const suspected: Record<string, number> = {};
  const deadly: Record<string, number> = {};
  for (const n of s.nights) {
    const sus = suspicionCounts(s, n);
    for (const [id, c] of Object.entries(sus)) if (byId.get(id)?.role === 'guest') suspected[id] = (suspected[id] ?? 0) + c;
    for (const [pickerId, targets] of Object.entries(n.picks)) {
      if (byId.get(pickerId)?.role !== 'killer' || !n.eligible.includes(pickerId)) continue;
      deadly[pickerId] = (deadly[pickerId] ?? 0) + targets.filter((t) => n.victims.includes(t)).length;
    }
  }

  const entries = (ids: Player[], src: Record<string, number>): AwardEntry[] =>
    ids.map((p) => ({ id: p.id, value: src[p.id] ?? 0 }));

  const rounds: RevealView['rounds'] = [];
  for (let r = 1; r <= s.round; r++) {
    rounds.push({
      round: r,
      victims: s.nights.find((n) => n.round === r)?.victims ?? [],
      trials: s.votes
        .filter((v) => v.round === r)
        .map((v) => ({
          isRevote: v.isRevote,
          candidates: v.candidates,
          ballots: Object.entries(v.ballots).map(([voter, target]) => ({ voter, target })),
          tied: v.tied,
          eliminated: v.eliminated,
        })),
    });
  }

  return {
    winner: s.winner,
    players: s.players.map((p) => ({ id: p.id, name: p.name, role: p.role, photoVersion: p.photoVersion, memeVersion: p.memeVersion ?? 0 })),
    killers: killers.map((k) => ({
      id: k.id,
      fate: k.alive ? 'survived' : k.death === 'voted' ? `voted out in round ${k.diedRound}` : `left in round ${k.diedRound}`,
    })),
    rounds,
    awards: {
      bestDetective: topBy(entries(guests, detective), 'max'),
      fastestFall,
      mostSuspected: topBy(entries(guests, suspected), 'max'),
      deadliestKiller: topBy(entries(killers, deadly), 'max'),
      teflon: topBy(entries(killers, votesFor), 'min'),
    },
  };
}

export function hostView(state: GameState, now: number): HostView {
  const night = currentNight(state);
  const vote = currentVote(state);
  const nightComputed: HostComputed['night'] =
    night && state.round > 0
      ? (() => {
          const counts = countKillerPicks(state, night, false);
          const sus = suspicionCounts(state, night);
          const nm = (id: string) => state.players.find((p) => p.id === id)?.name ?? '';
          return {
            round: night.round,
            killerPicks: counts,
            slotsFilled: Math.min(state.victimsPerNight, Object.keys(counts).length),
            fewerThanThree: Object.keys(counts).length < state.victimsPerNight,
            suspicionTop5: Object.keys(sus)
              .sort((a, b) => sus[b] - sus[a] || nm(a).localeCompare(nm(b)))
              .slice(0, 5)
              .map((id) => ({ id, count: sus[id] })),
            victims: night.victims,
          };
        })()
      : null;
  const voteComputed: HostComputed['vote'] = vote
    ? (() => {
        const alive = new Set(living(state).map((p) => p.id));
        const counts = tally(state, vote);
        const voted = Object.entries(vote.ballots).filter(([voter, t]) => alive.has(voter) && t in counts).length;
        return {
          round: vote.round,
          isRevote: vote.isRevote,
          candidates: vote.candidates,
          tally: counts,
          votedCount: voted,
          notVoted: Math.max(0, alive.size - voted),
          tied: vote.tied,
          eliminated: vote.eliminated,
        };
      })()
    : null;
  const { players, ...rest } = state;
  return {
    ...rest,
    title: gameTitle(state),
    players: players.map(({ token: _token, ...p }) => p),
    reveal: state.phase === 'ended' ? buildReveal(state) : null,
    computed: {
      killerCountAuto: defaultKillerCount(players.length),
      killerCount: killerCount(state),
      status: { ...statusLine(state), guestsLeft: livingGuests(state).length },
      night: nightComputed,
      vote: voteComputed,
    },
    serverNow: now,
  };
}
