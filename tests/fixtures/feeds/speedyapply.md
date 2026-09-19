# 2026 SWE College Jobs by speedyapply

Modeled on the REAL speedyapply `main/README.md` (verified via WebFetch 2026-07-13).
Unlike SimplifyJobs (HTML table) and vanshb03 (5-column pipe), speedyapply is a
SIX-column pipe table with a **Salary** column inserted before the apply link:

`| Company | Position | Location | Salary | Posting | Age |`

The company cell is `<a href><strong>Name</strong></a>`, the apply link is an
`<a href><img alt="Apply"></a>` in the **Posting** column (index 4), and Age is a
bare `Nd`. The generic 5-column parser reads index 3 (Salary) as the apply cell,
finds no href there, and drops every row — which is exactly why this source is
DISABLED in read-feeds.mjs (see the "incompatible" test in read-feeds.test.ts).

| Company | Position | Location | Salary | Posting | Age |
|---|---|---|---|---|---|
| <a href="https://www.nvidia.com"><strong>NVIDIA</strong></a> | Performance Engineer Intern - Systems Software - Fall 2026 | St. Louis, MO | $62/hr | <a href="https://nvidia.wd5.myworkdayjobs.com/en-US/nvidiaexternalcareersite/job/US-MO-St-Louis/Performance-Engineer-Intern_JR2015779"><img src="https://i.imgur.com/JpkfjIq.png" alt="Apply" width="70"/></a> | 6d |
| <a href="https://www.tiktok.com"><strong>TikTok</strong></a> | Frontend Software Engineer Intern - 2026 Start | San Jose, CA | $60/hr | <a href="https://lifeattiktok.com/search/7654431844394322229"><img src="https://i.imgur.com/JpkfjIq.png" alt="Apply" width="70"/></a> | 18d |
| <a href="https://careers.rivian.com"><strong>Rivian</strong></a> | Software Engineering Intern - Applications - Fall 2026 | Irvine, CA +1 | $51/hr | <a href="https://jobs.ashbyhq.com/rivianvw.tech/3f314ca7-978e-4ad6-b527-0487a9a9598c"><img src="https://i.imgur.com/JpkfjIq.png" alt="Apply" width="70"/></a> | 38d |
