# public/mocks — real app screenshots for the landing

The landing's screenshot strip (`#welcome`) and the two product bands (`#feed`, `#roadmap`) read this
folder at render time through `components/landing/mocks.ts`. Nothing here is generated, illustrated or
mocked up: every file is a capture of the running Prospect app.

## Contract

- PNG only. Anything else is ignored.
- The filename stem is the name a band asks for and the alt text a screen reader reads.
  `feed.png` becomes "Prospect feed screen"; `roadmap-390.png` becomes "Prospect roadmap 390 screen".
- The two named bands look for a stem that STARTS WITH `feed` and `roadmap`. Every PNG in the folder,
  named or not, also appears in the marquee strip.
- While the folder holds only this README, every consumer renders a named empty state
  ("App screenshots pending") and no placeholder art. That is the intended state, not a bug.

## Who fills it

The orchestrator (MISSION D-UI6): a worker agent cannot reach localhost, so captures are taken with the
one Playwright profile after the lane merges. Suggested set, light theme, 1440 wide:
`feed.png`, `roadmap.png`, `setup.png`, `journey.png`.
