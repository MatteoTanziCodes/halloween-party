// Shared shapes for the game state and the views sent to phones.
// Rebuilt from usage in game.ts: the deployed bundle drops type-only modules.

export type Phase = 'lobby' | 'idle' | 'night' | 'morning' | 'vote' | 'verdict' | 'ended';
export type Role = 'killer' | 'guest';
export type Death = 'murdered' | 'voted' | 'removed';
export type Winner = 'killers' | 'guests';

export interface Player {
  id: string;
  token: string;
  name: string;
  role: Role | null;
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

export interface AwardEntry {
  id: string;
  value: number;
}

export interface RevealView {
  winner: Winner | null;
  players: { id: string; name: string; role: Role | null; photoVersion: number; memeVersion: number }[];
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
    death: Death | null;
    diedRound: number | null;
    photoVersion: number;
    memeVersion: number;
  };
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
  status: StatusLine & { guestsLeft: number };
  night: {
    round: number;
    killerPicks: Record<string, number>;
    slotsFilled: number;
    fewerThanThree: boolean;
    suspicionTop5: { id: string; count: number }[];
    victims: string[];
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
