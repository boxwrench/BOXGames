# Deep Water & Omens — Design Addendum

**Date:** 2026-09-23 · **Status:** requested by the user in chat ("as the game goes on, get more unhinged; reward going
further; get absurd with the fishing imagery — a super realistic bluegill says *I'm proud of you, son*, lightning turns
the sun into a Bass God").

## Rewards for depth

- **Milestones** at 300, 600, 1,000, 1,500, 2,000, 2,600, 3,300, 4,000 m, then every 800 m.
- Each milestone pays `500 × milestone number` points plus the omen's own bonus, and raises the **depth multiplier**
  by 0.1 (cap ×2.0). Air points are multiplied by depth × any active omen buff.

## Omens (one per milestone; the first seven in this order, then random without immediate repeats)

| # | Omen | What happens | Reward |
|---|---|---|---|
| 1 | Bobber Moon | A giant red/white bobber rises as the moon, its line vanishing upward | — |
| 2 | Proud Bluegill | A painted, realistic bluegill slides in: "I'm proud of you, son." (spoken via Web Speech when available) | +2,000 |
| 3 | It's Raining Bait | Fish fall around PJ for 12 s; each one PJ touches is caught | +250 per catch |
| 4 | Land Trout Sighted | A colossal trout with mountains and forest on its back swims through the hills (user-supplied art) | ×1.5 for 14 s |
| 5 | The Bass God | Lightning strikes; the sun becomes a crowned, glowing largemouth; a choir sings | +5,000, ×2 for 20 s |
| 6 | The Sky Is a Lake | The sky floods: water gradient, rising bubbles, giant fish swimming overhead | ×1.5 for 16 s |
| 7 | Don't Take the Bait | A giant hook with a wriggling worm descends ahead of PJ, then yanks away | +3,000, ×2 for 10 s |

Omens are presentation plus score effects only — they never change physics, so the 200-seed fairness test stays valid.

## Architecture

- `weird/director.ts` (pure, tested): milestone schedule, depth multiplier, omen order/picking, buff timers.
- `weird/art.ts`: canvas painters (realistic bluegill, Bass God, small fish, bubbles).
- `weird/omens.ts`: the 3D/DOM staging of each omen; reports fish caught.
- `Score` gains `bonus` (depth × buffs) applied to air points and `award(points)` for milestone and catch bonuses.
- HUD: depth badge, buff badge with countdown, milestone banner, omen title card, bluegill overlay with speech bubble;
  results card shows depth reached and omens witnessed.
- Audio: thunder, choir, splash, bubbles; optional speech synthesis (muted with the game).
