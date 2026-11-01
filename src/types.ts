// Shared shapes for the game state and the views sent to phones.
// Rebuilt from usage in game.ts: the deployed bundle drops type-only modules.

export type Phase = 'lobby' | 'idle' | 'night' | 'morning' | 'vote' | 'verdict' | 'ended';
export type Role = 'killer' | 'guest';
/** A special guest. Killers never have one. */
export type Power = 'investigator' | 'exorcist' | 'medium';
export type Death = 'murdered' | 'voted' | 'removed';
export type Winner = 'killers' | 'guests';

export interface Player {
  id: string;
  token: string;
  name: string;
  role: Role | null;
  /** Optional: older saved games predate powers. */
  power?: Power | null;
  alive: boolean;
  death: Death | null;
  diedRound: number | null;
  joinedAt: number;
  photoVersion: number;
  /** Optional: older saved games predate memes. */
  memeVersion?: number;
}

export interface Night {
  round: number;
  /** pickerId -> picked player ids */
  picks: Record<string, string[]>;
  victims: string[];
  /** Players alive when the night opened; only their picks count. */
  eligible: string[];
  /** Power players' single target: playerId -> targetId. Optional: older saved games predate powers. */
  actions?: Record<string, string>;
  /** Players the killers chose who an Exorcist protected. */
  saved?: string[];
  /** What each power player learned when the night closed. */
  findings?: Record<string, Finding>;
}

export type Finding =
  | { kind: 'investigator'; target: string; isKiller: boolean }
  | { kind: 'exorcist'; target: string; saved: boolean }
  /** saw: someone alive who tapped the spirit the night they died, or null if nobody. */
  | { kind: 'medium'; spirit: string; saw: string | null };

export interface PowerCounts {
  investigator: number;
  exorcist: number;
  medium: number;
}

export interface Vote {
  round: number;
  candidates: string[];
  /** voterId -> targetId */
  ballots: Record<string, string>;
  isRevote: boolean;
  tied: string[];
  eliminated: string | null;
}

export interface GameState {
  version: number;
  title: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  /** Night timer length. Optional: older saved games predate it (60s). */
  nightSeconds?: number;
  victimsPerNight: number;
  killerCountOverride: number | null;
  players: Player[];
  nights: Night[];
  votes: Vote[];
  winner: Winner | null;
  createdAt: number;
  nightEndsAt: number | null;
  undoLabel: string | null;
}

export interface StatusLine {
  livingCount: number;
  killersLeft: number;
}

export interface SummaryView {
  title: string;
  items: { id: string; name: string; count: number }[];
  warning: string | null;
}

export interface FindingView {
  round: number;
  kind: Power;
  /** Investigator and Exorcist: who they chose. Medium: the spirit. */
  name: string;
  /** Investigator only. */
  isKiller?: boolean;
  /** Exorcist only. */
  saved?: boolean;
  /** Medium only: undefined for other powers, null when nobody could be named. */
  saw?: string | null;
}

export interface AwardEntry {
  id: string;
  value: number;
}

export interface RevealView {
  winner: Winner | null;
  players: {
    id: string;
    name: string;
    role: Role | null;
    power: Power | null;
    death: Death | null;
    photoVersion: number;
    memeVersion: number;
  }[];
  killers: { id: string; fate: string }[];
  rounds: {
    round: number;
    victims: string[];
    trials: {
      isRevote: boolean;
      candidates: string[];
      ballots: { voter: string; target: string }[];
      tied: string[];
      eliminated: string | null;
    }[];
  }[];
  awards: {
    bestDetective: AwardEntry[];
    fastestFall: AwardEntry[];
    mostSuspected: AwardEntry[];
    deadliestKiller: AwardEntry[];
    teflon: AwardEntry[];
  };
}

export interface PlayerView {
  version: number;
  title: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  me: {
    id: string;
    name: string;
    alive: boolean;
    role: Role | null;
    power: Power | null;
    death: Death | null;
    diedRound: number | null;
    photoVersion: number;
    memeVersion: number;
  };
  /** Set at night for a living power player: who they may choose tonight. */
  power: { kind: Power; choices: { id: string; name: string; photoVersion: number; memeVersion: number }[]; blocked: string | null } | null;
  findings: FindingView[];
  living: { id: string; name: string; photoVersion: number; memeVersion: number }[];
  myPicks: string[];
  myVote: string | null;
  candidates: string[] | null;
  teammates: { id: string; name: string }[] | null;
  teamPicks: Record<string, number> | null;
  summary: SummaryView | null;
  nightEndsAt: number | null;
  serverNow: number;
  status: StatusLine;
  winner: Winner | null;
  reveal: RevealView | null;
}

export interface HostComputed {
  killerCountAuto: number;
  killerCount: number;
  powerCounts: PowerCounts;
  status: StatusLine & { guestsLeft: number };
  night: {
    round: number;
    killerPicks: Record<string, number>;
    slotsFilled: number;
    fewerThanThree: boolean;
    suspicionTop5: { id: string; count: number }[];
    victims: string[];
    /** Exorcists' targets tonight, so the host's preview of deaths is right. */
    protected: string[];
    saved: string[];
    powersActed: number;
    powersTotal: number;
  } | null;
  vote: {
    round: number;
    isRevote: boolean;
    candidates: string[];
    tally: Record<string, number>;
    votedCount: number;
    notVoted: number;
    tied: string[];
    eliminated: string | null;
  } | null;
}

export interface HostView extends Omit<GameState, 'players'> {
  players: Omit<Player, 'token'>[];
  reveal: RevealView | null;
  computed: HostComputed;
  serverNow: number;
}
