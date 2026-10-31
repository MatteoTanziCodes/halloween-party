// All instruction and screen text lives here so it can be tweaked without touching logic.
// The game's name is set by the host and arrives from the server; this is only the fallback.
window.COPY = {
  defaultTitle: 'Murder on the Mews',

  // ---- guest ----
  joinHint: 'Type your name to join the game.',
  joinLabel: 'Your name',
  joinPlaceholder: 'First name and last initial',
  joinButton: 'Join',
  joinClosed: "The game's already started. Enjoy the party!",
  weirdBrowser: 'Opened in a weird browser? Tap ⋯ → Open in Safari/Chrome.',
  weirdBrowserLoud: "This looks like an in-app browser, and it can lose your login. Tap ⋯ → Open in Safari/Chrome before you join.",
  noStorage: "Don't close this tab.",
  lost: 'We lost you. Find the host and ask for a rejoin code.',
  loading: 'Loading…',
  youreIn: (name) => `You're in, ${name}.`,
  memeLabel: (name) => `${name}'s meme`,
  memeNone: 'No meme for them yet.',
  memeTip: 'Tip: hold down on any name to see their meme costume.',
  lobbyWait: (n) => `Waiting for the host to start. ${n} player${n === 1 ? '' : 's'} so far.`,

  statusBefore: (players, killers) =>
    `Game starts soon · ${players} players · ${killers} killer${killers === 1 ? '' : 's'}`,
  statusDuring: (round, total, alive, killers) =>
    `Round ${round} of ${total} · ${alive} alive · ${killers} killer${killers === 1 ? '' : 's'} left`,

  holdLabel: 'Hold to see your role',
  helpLabel: 'How to play',

  headings: {
    idle: 'Nothing to do right now',
    night: 'Tap up to 3 names.',
    nightDone: 'Picks saved.',
    nightOver: "Night's over.",
    morning: 'Listen to the host.',
    vote: 'Vote someone out.',
    voteDead: "You're out.",
    verdict: 'Listen to the host.',
  },

  hints: {
    idle: 'Enjoy the party. The host will call night soon.',
    night: 'Then tap Done. Keep your phone out until the timer hits zero.',
    nightDone: 'Keep your phone out until the timer ends.',
    nightOver: 'Picks locked. Listen to the host.',
    morning: 'Listen to the host for who died.',
    vote: 'Pick one person to vote out. You can change your vote until the host closes voting.',
    voteDead: "You're dead, so you can't vote. Stay quiet!",
    verdict: "Listen to the host for who's out.",
  },

  selected: (n, max) => `${n} of ${max} selected.`,

  // Special guests: the night list shows one choice instead of three, so from across the room
  // their phone looks the same as everyone else's.
  powerHeadings: {
    investigator: 'Pick one person to investigate.',
    exorcist: 'Pick one person to protect.',
    medium: 'Pick one spirit to contact.',
  },
  powerHint: 'Then tap Done. Your answer comes in the morning: hold the role button to see it.',
  noSpirits: 'Nobody has been murdered yet, so there are no spirits to reach. Just tap Done.',
  morningPower: 'Hold the button to see what you learned last night.',
  done: 'Done',
  changePicks: 'Change picks',
  voteYours: (name) => `Your vote: ${name}. Tap another name to change it.`,
  voteNone: 'Tap a name to vote.',
  noPicks: 'Nobody yet',

  helpTitle: 'How to play',
  help: [
    "Hold the button to see your secret role. Don't show anyone.",
    'When the host calls night, tap up to 3 names. Everyone does this, so nobody looks suspicious. Special guests tap just one.',
    'The host announces who died. Then everyone argues and votes someone out.',
    'If you die, keep partying, but no hints and no voting.',
    'Guests win by voting out every killer. Killers win if they last 5 rounds, or if they ever equal the guests.',
    "Hold down on anyone's name to see their meme costume.",
  ],
  helpClose: 'Got it',

  cardLabel: 'Your role',
  cardGuest: 'Find the killers. At night, tap the people you suspect. At the trial, vote out whoever you think is a killer.',
  cardKiller: (names) =>
    `Your team: ${names}. At night, tap up to 3 people to kill. The Team picks box shows your team's top 3 right now, so agree on the same 3 before the timer runs out. Act normal and never pick each other.`,
  cardKillerAlone: 'just you',
  cardRoleLine: (role, power) =>
    role === 'killer' ? "You're a KILLER" : power ? `You're the ${power.toUpperCase()}` : "You're a GUEST",
  cardPower: {
    investigator:
      "You're a guest with a gift. Each night, pick one person to investigate. In the morning you'll learn if they're a killer. Share carefully: the killers will come for you.",
    exorcist:
      "You're a guest with a gift. Each night, pick one person to protect. If the killers go for them, they survive. You can't protect yourself, or the same person two nights running.",
    medium:
      "You're a guest with a gift. Each night, pick one murdered player to contact. Their spirit names someone who tapped them the night they died. Killers did, but so did guests, so it's a lead, not proof.",
  },
  finding: (f) => {
    const r = `Round ${f.round}: `;
    if (f.kind === 'investigator') return r + `${f.name} is ${f.isKiller ? 'a KILLER' : 'not a killer'}.`;
    if (f.kind === 'exorcist') return r + (f.saved ? `You saved ${f.name}! The killers came for them.` : `You protected ${f.name}.`);
    return r + (f.saw ? `${f.name}'s spirit names ${f.saw}.` : `${f.name}'s spirit had nobody to name.`);
  },
  cardAlive: "You're alive.",
  cardDeath: (death, round) =>
    death === 'murdered'
      ? `You were murdered in round ${round}.`
      : death === 'voted'
        ? `You were voted out in round ${round}.`
        : 'You left the party.',
  cardDeadTip: "You're out, but stay at the party. Don't drop hints and don't vote. You'll find out who the killers were at the end.",
  cardNoRole: "The game hasn't started yet.",

  // ---- reveal (every phone, at the end) ----
  reveal: {
    winner: (w) => (w === 'guests' ? 'Guests win!' : 'Killers win!'),
    lead: (n) => (n === 1 ? "Here's who did it." : `Here are the ${n} who did it.`),
    killers: (n) => (n === 1 ? 'The killer' : 'The killers'),
    awardsTitle: 'Awards',
    awardNames: {
      bestDetective: 'Best Detective',
      fastestFall: 'Fastest Fall',
      mostSuspected: 'Most Suspected',
      deadliestKiller: 'Deadliest Killer',
      teflon: 'Teflon',
    },
    detective: (n) => `Voted for a killer ${n} time${n === 1 ? '' : 's'}`,
    fall: (round) => `Voted out in round ${round}, innocent`,
    suspected: (n) => `Suspected ${n} time${n === 1 ? '' : 's'} at night`,
    deadliest: (n) => `${n} of their picks died`,
    teflon: (n) => (n === 0 ? 'Not a single vote against them all game' : `Just ${n} vote${n === 1 ? '' : 's'} against them all game`),
    roundsTitle: 'Round by round',
    round: (n) => `Round ${n}`,
    murdered: 'Murdered:',
    nobody: 'nobody',
    trial: 'Trial:',
    revote: 'Revote:',
    votedOut: (name, killer) => `${name} voted out, ${killer ? 'a killer' : 'innocent'}.`,
    tieNone: 'a tie, nobody voted out.',
    nobodyOut: 'nobody voted out.',
    howVoted: (n) => `How everyone voted (${n})`,
    votedFor: 'voted for',
    killerMark: ' (killer)',
    winnersTitle: (n) => `Winners (${n})`,
    losersTitle: (n) => `Losers (${n})`,
    powersTitle: 'Special guests',
    powerName: { investigator: 'Investigator', exorcist: 'Exorcist', medium: 'Medium' },
  },

  // ---- host ----
  hostPinTitle: 'Host sign-in',
  hostPinHint: 'Enter the host PIN.',
  hostPinLabel: 'PIN',
  hostPinButton: 'Sign in',
  hostPinWrong: 'Wrong PIN.',
  hostHelpTitle: 'How hosting works',
  hostHelpLabel: 'How hosting works',
  // The host guide: what the host needs to know, in the order they need it.
  hostGuide: [
    {
      title: 'Your job',
      items: [
        "You're the narrator, not a player. You see everyone's role, so don't play.",
        "The 'Do this now' line at the top always says what to do next, and the big button below it does it.",
        "Keep 'Hide roles' on whenever guests can see your screen.",
      ],
    },
    {
      title: 'Before you start',
      items: [
        'Put the join QR code where people can scan it (Print poster makes a big one). Everyone joins on their own phone.',
        'Optional: tap Add photos to snap each guest, so faces show next to names.',
        'Check the player count matches the room. Killers and special guests are set automatically from it (you can change the killer count).',
        "Gather everyone and read the rules speech (button below), then tap Start game. Once you start, nobody else can join.",
      ],
    },
    {
      title: 'Each round',
      items: [
        "Night: say 'Night has fallen, phones out', tap Open night. Everyone taps names for 60 seconds. Wait for the timer, then tap Close night. Tap +30s if the killers or special guests clearly need longer.",
        'Morning: read out who died. If an Exorcist saved someone, read the line shown, but never say who.',
        'Then give everyone about 10 minutes to argue, and tap Open vote.',
        "Vote: everyone alive votes on their phone. Call 'last 30 seconds', then tap Close vote. On a tie, choose Revote between the tied players, or No elimination.",
        "Verdict: announce who's out and whether they were a killer. Then tap Next round.",
      ],
    },
    {
      title: 'How it ends',
      items: [
        'Guests win the moment every killer is voted out.',
        'Killers win the moment they equal or outnumber the guests, or if any killer is still alive after round 5.',
        "When it ends, every phone shows the reveal: the winners, the losers (voted-out players aren't on either list), the killers, the special guests and awards. Read it out.",
      ],
    },
    {
      title: 'Special guests',
      items: [
        "Some guests get a secret power. At night they pick one name instead of three, so nobody can tell from across the room. Their result appears in the morning when they hold their role button. You don't need to do anything for them.",
        'Investigator: learns whether the person they picked is a killer.',
        "Exorcist: protects one person. If the killers pick them, they survive and the killers don't get a replacement. Can't protect themselves, or the same person two nights running.",
        "Medium: picks a murdered player and learns the name of someone who tapped them the night they died. Usually a killer, but guests tap for cover too, so it's a lead, not proof.",
      ],
    },
    {
      title: 'When something goes wrong',
      items: [
        "Phone died or someone closed the tab: open them in the player list, tap Rejoin, and have them scan the code. Their role carries over.",
        "Someone leaves: open them and tap Remove. They count as dead. Every phone's 'killers left' count updates, so tell the room whether they were a killer.",
        "Tapped the wrong button: tap Undo right under the big button. It goes back one step. Undoing Close night reopens the night with at least 30 seconds on the clock. Undo isn't available after you remove someone.",
        'Need to stop early: End game now (in Danger zone). The winner is decided by who is left.',
      ],
    },
  ],
  rulesButton: 'Rules speech',
  rulesTitle: 'Read this aloud',
  rulesSpeech: [
    "Welcome to the murder party. Some of you are secretly killers. Everyone else is a guest, and a few guests have a secret power.",
    "When I start the game, hold the button on your phone to see your role. Don't show anyone. You can check it again any time.",
    "Each round has a night and a trial. At night, I'll say 'phones out' and everyone taps up to 3 names. Killers tap who they want dead. Guests tap whoever they suspect. Everyone does it, so nobody looks suspicious.",
    "Special guests tap just one name: the Investigator checks if someone is a killer, the Exorcist protects someone, and the Medium talks to a murdered player's spirit. They see their answer in the morning.",
    "In the morning I'll announce who died. Then you argue, accuse and defend, and everyone alive votes one person out. I'll tell you if they were a killer.",
    "If you die, keep partying, but no hints, no voting and no talking about the game.",
    "Guests win by voting out every killer. Killers win if they last 5 rounds, or if they ever equal the guests. Good luck.",
  ],

  doThisLabel: 'Do this now',
  doThis: {
    lobby: 'Guests are joining. When everyone is in, check the player count, read the rules speech (below), then tap Start game.',
    idle: "Free time. When it's time for the next round, say 'Night has fallen, phones out,' then tap Open night.",
    night: 'Wait for the countdown to hit zero, then tap Close night. Tap +30s if the killers or special guests clearly need more time.',
    nightWarn: "Killers haven't picked 3 people yet. If you close now, fewer than 3 people die.",
    morning: "Gather everyone and read out who died. Remind special guests to check their role button. Give everyone 10 minutes to argue, then tap Open vote.",
    vote: "Call 'last 30 seconds,' then tap Close vote.",
    voteTie: "It's a tie. Revote between them, or skip this round's elimination.",
    verdict: (name, wasKiller) =>
      `Announce: '${name} is out, and they were ${wasKiller ? 'a killer' : 'innocent'}.' Then tap Next round.`,
    lastRound: ' This was the last round, so Next round ends the game.',
    verdictNone: "Announce: 'Nobody is eliminated this round.' Then tap Next round.",
    ended: "Everyone's phone now shows the reveal. Read out the killers, then the awards.",
  },

  primary: {
    lobby: 'Start game',
    idle: 'Open night',
    night: 'Close night',
    morning: 'Open vote',
    vote: 'Close vote',
    verdict: 'Next round',
    verdictLast: 'End game and show reveal',
  },
  revote: 'Revote between tied players',
  noElimination: 'No elimination this round',
  extend: '+30s',
  timeUp: "Time's up",
  needPlayers: 'Need at least 4 players.',

  undoConfirm: (label) => `Undo ${label}? The game goes back to just before it. Anyone it eliminated comes back, and picks or votes made since then are cleared.`,
  undoStartWarn: 'Players have already seen their roles. Starting again gives new roles.',

  victimsNone: 'Nobody died.',
  savedNote: (n) =>
    n === 1
      ? "An Exorcist saved someone tonight. Say: 'The killers struck, but a spirit turned them away.'"
      : `Exorcists saved ${n} people tonight. Say: 'The killers struck, but the spirits turned them away.'`,
  protectedLine: (names) => `Protected by an Exorcist: ${names}`,
  powersActed: (n, total) => `Special guests: ${n} of ${total} have chosen`,
  powersLabel: 'Special guests',
  powersLine: (c) => `Set by player count: ${c.investigator} Investigator${c.investigator === 1 ? '' : 's'} · ${c.exorcist} Exorcist${c.exorcist === 1 ? '' : 's'} · ${c.medium} Medium${c.medium === 1 ? '' : 's'}`,
  verdictOutName: (name) => `${name} is out.`,
  verdictWas: (wasKiller, power) =>
    wasKiller ? 'They were a KILLER.' : power ? `They were innocent: the ${power.toUpperCase()}.` : 'They were an innocent guest.',
  verdictNone: 'Nobody is eliminated this round.',

  killerPicks: (filled) => `Killer picks · ${filled} of 3 slots filled`,
  roleName: { killer: 'killer', guest: 'guest', investigator: 'investigator', exorcist: 'exorcist', medium: 'medium' },
  wouldDie: (names) => `If you close now: ${names}`,
  tiedSlots: (open, names) => `Tied: ${names}. ${open === 1 ? 'One of them dies' : `${open} of them die`}, picked at random.`,
  noPicksYet: 'No picks yet.',
  suspectsTitle: 'Most suspected (for fun)',
  noSuspects: 'No suspicion taps yet.',
  voted: (n, total) => `${n} of ${total} have voted`,
  tie: (names) => `Tie: ${names}`,

  titleLabel: 'Game name',
  titlePrompt: 'What should the game be called?',
  killersLabel: 'Killers',
  killersAuto: (n) => `Auto (${n} for this many players)`,
  killersOverride: (n) => `Set by you · auto would be ${n}`,
  useAuto: 'Use auto',
  printPoster: 'Print poster',
  addPhotos: 'Add photos',
  playersTitle: (n) => `Players (${n})`,
  hideRoles: 'Hide roles',
  photo: 'Photo',
  meme: 'Add meme',
  replaceMeme: 'Replace meme',
  memeFailed: 'Could not save the meme.',
  retake: 'Retake photo',
  rejoin: 'Rejoin',
  rename: 'Rename',
  remove: 'Remove',
  renamePrompt: (name) => `New name for ${name}`,
  removeConfirm: (name) => `Remove ${name}? They count as dead.`,
  deathTag: { murdered: 'murdered', voted: 'voted out', removed: 'left' },
  rejoinTitle: (name) => `Rejoin ${name}`,
  rejoinHint: 'Have them scan this on their new phone. Their role and status carry over.',
  close: 'Close',
  queueNext: (name) => `Next: ${name}`,
  queueHint: 'Snap them (or their Polaroid), then save.',
  queueTake: 'Take photo',
  queueSkip: 'Skip',
  queueDone: 'All caught up',
  queueDoneHint: 'Everyone has a photo.',
  photoFailed: 'Could not save the photo.',
  dangerTitle: 'Danger zone',
  endGame: 'End game now',
  endConfirm: 'End the game now? The winner is decided by the normal rules.',
  reset: 'Reset',
  resetPrompt: 'This wipes every player and photo. The game name stays. Type RESET to confirm.',

  posterTitle: 'Scan to join the game',
};
