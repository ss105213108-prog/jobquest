# JOBQUEST INITIAL PRODUCTION DEPLOY

Date: 2026-10-01

Final status: **INITIAL_PRODUCTION_DEPLOY = PASS**

Production URL: **[https://jobquest-snowy.vercel.app](https://jobquest-snowy.vercel.app)**

The fixed project production alias above is the origin for subsequent Supabase and Connector configuration. The immutable deployment URL is `https://jobquest-3z0oac4l3-lin-09f1.vercel.app`.

## Vercel deployment

| Item | Actual value |
| --- | --- |
| Account | `ss105213108-prog` |
| Scope/project | `lin-09f1/jobquest` |
| Project ID | `prj_3VxK6qMI9P7lzirscGzRkZSBIVxz` |
| Deployment ID | `dpl_5gnvzArnszu89m5ia7zos1tB6Cmq` |
| Target / state | `production` / `READY` |
| Inspector | [Vercel deployment](https://vercel.com/lin-09f1/jobquest/5gnvzArnszu89m5ia7zos1tB6Cmq) |
| CLI | Vercel 62.0.0 |
| Deploy command | `vercel deploy --prebuilt --prod --scope lin-09f1 --yes` |

## Completed preparation

- Verified the existing production build in `dist/` contains the expected `https://neqwkiruqfevlchiajor.supabase.co` URL and exactly the currently configured publishable key from `.env.local`.
- The key is `sb_publishable_…`; no secret/service-role value was added. The full key is intentionally omitted from this report.
- Copied the existing build unchanged to `.vercel/output/static/`, with `.vercel/output/config.json` containing `{ "version": 3 }`, following [Vercel Build Output API](https://vercel.com/docs/build-output-api).
- Downloaded official Vercel CLI 62.0.0 using a temporary npm cache; project dependencies and package-lock were not modified.
- The user completed Vercel CLI device login. CLI reported successful authentication; the account and project scope were then checked.
- Created the new `jobquest` project in the active `lin-09f1` scope; existing projects were not changed.
- Saved exactly the two public env values to Production with `--no-sensitive` (Config), using stdin without printing the key. Verified the two names, Config type and Production target after deployment.
- Vercel linking added `.vercel/project.json` and a `.vercel` ignore entry. Its automatically appended local OIDC token was removed; `.env.local` retains only the original two public Supabase values. The CLI-added broad `.env*` ignore entry was removed to retain the existing env-file ignore policy.

## Build identity

The deployment package is byte-for-byte identical to the existing `dist`; no rebuild or App change occurred.

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `index.html` | 569 | `c9786891dbe9d1e8933bfe3886d312f0d8824b84e5f69b73e8812f4abf8532e2` |
| `assets/index-C0uNNJTy.js` | 558724 | `abc6f0acf504684c73d3ed08e128d7d7d266893b847198e68fcb410d8044f1df` |
| `assets/index-T5LqOfg0.css` | 41322 | `a6e1a59477ec41cc76e5b3fe06fd47a2c7345fdc504fcd89f867cc4b398d96ff` |

Only build output is intended for publication. Source files, `.env.local`, CLI authentication data and Supabase/Extension source are not part of the static output.

## Remote configuration and verification

| Required step | Current result |
| --- | --- |
| Authenticated Vercel account | PASS |
| Create/confirm Vercel project and scope | PASS |
| Production env `VITE_SUPABASE_URL` | SAVED — expected JobQuest URL, Config |
| Production env `VITE_SUPABASE_PUBLISHABLE_KEY` | SAVED — matching public key, Config |
| Prebuilt production deployment | PASS — READY / production |
| Stable project production alias | `https://jobquest-snowy.vercel.app` |
| Public HTML / JS / CSS | All HTTP 200, without login cookies or protection bypass; all byte-identical to local dist |
| Browser homepage | PASS — guild welcome, login/register/guest controls visibly rendered |
| Blank screen / runtime errors | NONE observed; clean verification tab has zero console errors/warnings |
| Frontend service-role JWT / secret key | None detected |

The production alias is publicly accessible. Vercel's deployment metadata mentioned authentication protection, but independent HTTP requests to the production alias and its assets required no authentication and did not redirect. The browser check was repeated in a clean tab so old Vercel login-page console events were not mistaken for JobQuest runtime errors.

Screenshot: `C:/Users/user/.codex/visualizations/2026/09/29/01a0eb07-2eb1-7013-9686-e1339b2534ac/jobquest-initial-production-deploy.png`.

The existing build already embeds the verified public values; saving the same two values remotely does not rewrite a prebuilt bundle. Subsequent env changes will require a matching rebuilt frontend. References: [Vercel deploy](https://vercel.com/docs/cli/deploy), [Vercel environment variables](https://vercel.com/docs/cli/env).

Supabase Site URL/Redirect URLs, Connector allowlist, App/Batch/Matching/Auth/Resume code and database settings remain unchanged. Connector operation on the future production domain is intentionally outside this work item.

No login/register/guest creation or business-flow mutation was performed against the deployed App. Homepage loading is verified; production Auth/persistence/Connector manual acceptance is not claimed by this initial deployment.

STOP.
