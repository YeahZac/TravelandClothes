# Animation plans

| # | Title | Severity | Status | Depends on |
| --- | --- | --- | --- | --- |
| 001 | Gala screen: vertical reel draw + clean result (no box art) | HIGH | DONE | — |

## Recommended order

1. Execute **001** first (only plan). Covers PC `gala-screen` draw motion + result chrome in one pass.

## How to run

- Ask the agent: `improve-animations execute plans/001-gala-screen-reel-result.md`  
  or: implement that plan in Agent mode.
- After cloud deploy, confirm stamp `GALA_SCREEN …-draw-reel-v24`.
