# RP-112 TypeScript Probe Classification

Date: 2026-09-28. Investigation only. No deployment, inference, secret access,
private resume, production/test changes, suppression or parser repair.

## Result

- RP-112 TYPESCRIPT PROBE INVESTIGATION: COMPLETE
- RP112_SECONDARY_ROUTE_CAUSED_TS_FAILURE = NO
- Current probe exit code: 1
- Error count: 44, across 18 files
- Errors inside RP-112 changed files: NO
- Baseline produces same errors: YES, complete stdout byte-for-byte identical
- Classification: MIXED (B: 16, C: 28, A: 0, D: 0)
- Is this probe an existing repository release gate: NO
- Production behavior change required: NO
- Unrelated frozen tests require modification: NO
- Additional inference calls: 0
- Private resume used: NO
- Recommended next action: PROCEED_TO_EXISTING_RP112_VERIFICATION_AND_ONE_LIVE_SMOKE
- That recommendation is not executed in this investigation. No RP-113 work.

The prior RP-112 document's extra-probe blocker is superseded by this classification.
An ad hoc, pre-existing/non-route test failure must not be promoted into a route
runtime blocker. This does not certify deployed/native-PDF/schema runtime success,
nor remove any existing focused-test, app-TypeScript, build or privacy gate.

## Exact Probe

Working directory: C:/Users/user/Desktop/Figma全端課程/求職小工具

```powershell
$testFiles = @(Get-ChildItem -LiteralPath 'tests' -Recurse -File -Filter '*.ts' | ForEach-Object { $_.FullName })
node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --allowImportingTsExtensions --lib ES2022,DOM @testFiles
```

TypeScript: the already-installed 7.0.2 native compiler. No install or upgrade.
The existing exact command already contained --skipLibCheck; it was retained only
to reproduce the same probe, not added as a workaround. No compiler options,
tsconfig files, casts, @ts-ignore directives or source/tests were changed.

## Non-destructive Baseline

There is no .git in this checkout, so git/worktree baseline was unavailable.
The previous continuation retained a pre-secondary SHA-256 snapshot. A temporary
isolated project copy was made under .rp112-typecheck-baseline. Only its three
route-modified files were restored by reversing the exact authorized diff; the
active checkout was not reset, overwritten or switched. Each restored file
matched its pre-secondary hash exactly:

| File | Pre-secondary / restored SHA-256 |
| --- | --- |
| supabase/functions/_shared/aiResumeExtractionV1.ts | C5B655FFC351DDFD34272246A1EC42EEB39ACB436AF72A7143711640F8F4D1AD |
| tests/aiResumeExtractionContract.test.ts | 0BE6BA0B15CED8140BD2C8C602DD3AD166A7522963D388577BCAB3637B085D9E |
| tests/parseResumeAiEdgeFunction.test.ts | 9F11D70FFF381A19D14FD7CD6579768A5F1EF9148C01D0F239F8E1CDCB62D550 |

All 18 failing original files independently match the same pre-secondary snapshot.
The installed compiler and node_modules were reused, not copied/changed. Baseline
uses the same test enumeration and compiler flags, with only the compiler path
changed to ../node_modules/typescript/bin/tsc because the copy sits one level below
the original workspace. Relative module structure and the referenced 104 JSON
fixture were preserved. An initial incomplete isolation copy omitted that JSON
fixture and added one copy-only diagnostic; after copying that exact fixture, the
final baseline produced precisely the original 44 errors. None were filtered out.

Baseline exit code: 1. Full output equality: YES. New/removed/changed
diagnostics: 0/0/0. The temporary comparison files were removed after verification.

## Classification Evidence

A = INTRODUCED_BY_RP112_SECONDARY_ROUTE
B = PRE_EXISTING_OR_UNRELATED_TEST_ERROR
C = TEST_TYPECHECK_ENVIRONMENT_MISMATCH
D = INSUFFICIENT_EVIDENCE

B is proved by identical failing-file hashes and the exact full baseline replay,
not by the errors merely being in tests/. This includes actual existing fixture
typing/AST problems; they were not declared harmless or repaired.

C is supported independently by environment evidence:
- The probe enumerates tests/*.ts and uses --ignoreConfig, instead of loading the
  app config's src include. It does not include src/vite-env.d.ts, whose existing
  reference loads vite/client declarations for ImportMeta.env, ?url and ?raw.
- A diagnostic-only baseline probe added --types vite/client, with all other
  original settings unchanged. Exactly those four errors disappeared; 40 remained.
  This was evidence gathering, not a passing release gate or a source/config fix.
- @types/node is absent from the installed root node_modules and is not declared
  in package.json. A diagnostic-only --types node,vite/client probe returned TS2688
  for node. Thus 24 node:fs/path/url import errors arise from missing type-library
  availability, not from a secondary-route source change. No dependency was added.

## Repository Gate Evidence

package.json defines:
- typecheck = tsc --noEmit -p tsconfig.app.json --pretty false
- build = tsc --noEmit -p tsconfig.app.json && vite build
- test scripts use Vitest; no all-tests compiler script is declared.

tsconfig.app.json includes src, and the solution config references only app/node
configs. The node config includes vite.config.ts. No repository CI pipeline for
this all-tests probe was found. Prior verification docs name the app -p command.
The all-tests --ignoreConfig invocation was an additional probe introduced during
the immediately preceding secondary-route continuation, not a pre-existing formal
repository release gate. This conclusion concerns repository-defined gates only,
not an assertion about unknown external CI policies.

## Failing Files

Every file below has zero changes in the current RP-112 secondary-route diff,
and its hash matches the pre-secondary snapshot.

| File | Errors | Classes | In RP-112 diff | Baseline hash match |
| --- | ---: | --- | --- | --- |
| `src/analyzers/sectionDetector.ts` | 1 | C | NO | YES |
| `src/parsers/pdfLineReconstructor.ts` | 1 | C | NO | YES |
| `src/parsers/pdfResumeParser.ts` | 1 | C | NO | YES |
| `tests/helpers/anonymousPdfGraphicsHarness.ts` | 5 | B | NO | YES |
| `tests/pdfLineReconstruction.test.ts` | 2 | C | NO | YES |
| `tests/pdfPageCoordinateCompatibility.test.ts` | 3 | C, B | NO | YES |
| `tests/pdfPageGeometryAdapterContract.test.ts` | 3 | B | NO | YES |
| `tests/pdfPageLayoutEvidenceInternalContract.test.ts` | 3 | C, B | NO | YES |
| `tests/pdfPageReconstructionHandoffContract.test.ts` | 1 | B | NO | YES |
| `tests/pdfParserPageAdmissionContract.test.ts` | 2 | C | NO | YES |
| `tests/pdfRegionOwnershipAdjudication.test.ts` | 1 | C | NO | YES |
| `tests/pdfVisualGroupFormationPolicyContract.test.ts` | 2 | C | NO | YES |
| `tests/pdfVisualGroupGroundTruthContract.test.ts` | 2 | C | NO | YES |
| `tests/pdfVisualGroupResultContract.test.ts` | 2 | C | NO | YES |
| `tests/resumeDocumentOutcomeContract.test.ts` | 8 | C, B | NO | YES |
| `tests/resumeParser.test.ts` | 3 | C | NO | YES |
| `tests/resumeParserHardening.test.ts` | 2 | C | NO | YES |
| `tests/resumeStructuredExtraction.test.ts` | 2 | C | NO | YES |

## Every Current Diagnostic

Location, code and relevant symbol/type come directly from the exact probe.
Every row also appears identically in baseline. All rows are outside the current
RP-112 changed files.

| ID | File:line:column | TS code | Class | Exact primary diagnostic / symbol | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/analyzers/sectionDetector.ts:49:20` | TS2339 | C | Property 'env' does not exist on type 'ImportMeta'. | Probe omits src/vite-env.d.ts; isolated --types vite/client removes this error. |
| 2 | `src/parsers/pdfLineReconstructor.ts:61:44` | TS2339 | C | Property 'env' does not exist on type 'ImportMeta'. | Probe omits src/vite-env.d.ts; isolated --types vite/client removes this error. |
| 3 | `src/parsers/pdfResumeParser.ts:2:26` | TS2307 | C | Cannot find module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' or its corresponding type declarations. | Probe omits src/vite-env.d.ts; isolated --types vite/client removes this error. |
| 4 | `tests/helpers/anonymousPdfGraphicsHarness.ts:120:28` | TS2349 | B | This expression is not callable. | Pre-existing adjacent throw/parenthesized assignment parsing and narrowing errors; same baseline bytes and diagnostic. |
| 5 | `tests/helpers/anonymousPdfGraphicsHarness.ts:121:10` | TS2339 | B | Property 'matrix' does not exist on type 'undefined'. | Pre-existing adjacent throw/parenthesized assignment parsing and narrowing errors; same baseline bytes and diagnostic. |
| 6 | `tests/helpers/anonymousPdfGraphicsHarness.ts:121:18` | TS2339 | B | Property 'strokeColor' does not exist on type 'undefined'. | Pre-existing adjacent throw/parenthesized assignment parsing and narrowing errors; same baseline bytes and diagnostic. |
| 7 | `tests/helpers/anonymousPdfGraphicsHarness.ts:121:31` | TS2339 | B | Property 'fillColor' does not exist on type 'undefined'. | Pre-existing adjacent throw/parenthesized assignment parsing and narrowing errors; same baseline bytes and diagnostic. |
| 8 | `tests/helpers/anonymousPdfGraphicsHarness.ts:121:42` | TS2339 | B | Property 'lineWidth' does not exist on type 'undefined'. | Pre-existing adjacent throw/parenthesized assignment parsing and narrowing errors; same baseline bytes and diagnostic. |
| 9 | `tests/pdfLineReconstruction.test.ts:1:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 10 | `tests/pdfLineReconstruction.test.ts:2:31` | TS2591 | C | Cannot find name 'node:url'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 11 | `tests/pdfPageCoordinateCompatibility.test.ts:1:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 12 | `tests/pdfPageCoordinateCompatibility.test.ts:2:31` | TS2591 | C | Cannot find name 'node:url'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 13 | `tests/pdfPageCoordinateCompatibility.test.ts:7:8` | TS2305 | B | Module '"pdfjs-dist/legacy/build/pdf.mjs"' has no exported member 'TextItem'. | Existing TextItem import does not match installed pdfjs-dist declarations; identical baseline diagnostic. |
| 14 | `tests/pdfPageGeometryAdapterContract.test.ts:90:36` | TS2345 | B | Argument of type '(view: number \| undefined) => void' is not assignable to parameter of type '(...args: [] \| [number, number, number] \| [number, number, number, number, number]) => Awaitable<void>'. | Existing it.each tuple/callback parameter types conflict; identical baseline diagnostic. |
| 15 | `tests/pdfPageGeometryAdapterContract.test.ts:91:42` | TS2322 | B | Type 'number \| undefined' is not assignable to type 'readonly number[]'. | Existing it.each tuple/callback parameter types conflict; identical baseline diagnostic. |
| 16 | `tests/pdfPageGeometryAdapterContract.test.ts:100:59` | TS2345 | B | Argument of type '(view: number) => void' is not assignable to parameter of type '(...args: [number, string, number, number] \| [number, number, number, number]) => Awaitable<void>'. | Existing it.each tuple/callback parameter types conflict; identical baseline diagnostic. |
| 17 | `tests/pdfPageLayoutEvidenceInternalContract.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 18 | `tests/pdfPageLayoutEvidenceInternalContract.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 19 | `tests/pdfPageLayoutEvidenceInternalContract.test.ts:252:36` | TS2488 | B | Type 'ArrayLike<number>' must have a '[Symbol.iterator]()' method that returns an iterator. | Existing ArrayLike<number> iterable assumption; identical baseline diagnostic. |
| 20 | `tests/pdfPageReconstructionHandoffContract.test.ts:169:76` | TS2488 | B | Type 'ArrayLike<number>' must have a '[Symbol.iterator]()' method that returns an iterator. | Existing ArrayLike<number> iterable assumption; identical baseline diagnostic. |
| 21 | `tests/pdfParserPageAdmissionContract.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 22 | `tests/pdfParserPageAdmissionContract.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 23 | `tests/pdfRegionOwnershipAdjudication.test.ts:2:18` | TS2307 | C | Cannot find module '../docs/investigations/rp-089-blinded-layouts.html?raw' or its corresponding type declarations. | Probe omits src/vite-env.d.ts; isolated --types vite/client removes this error. |
| 24 | `tests/pdfVisualGroupFormationPolicyContract.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 25 | `tests/pdfVisualGroupFormationPolicyContract.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 26 | `tests/pdfVisualGroupGroundTruthContract.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 27 | `tests/pdfVisualGroupGroundTruthContract.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 28 | `tests/pdfVisualGroupResultContract.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 29 | `tests/pdfVisualGroupResultContract.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 30 | `tests/resumeDocumentOutcomeContract.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 31 | `tests/resumeDocumentOutcomeContract.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 32 | `tests/resumeDocumentOutcomeContract.test.ts:3:31` | TS2591 | C | Cannot find name 'node:url'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 33 | `tests/resumeDocumentOutcomeContract.test.ts:173:37` | TS2353 | B | Object literal may only specify known properties, and 'reason' does not exist in type '{ readonly status: "SUCCESS"; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number \| undefined; readonly diagnostic?: Readonly<...> \| undefined; }'. | Existing classified-stage fixture reason/type mismatch; identical baseline diagnostic. |
| 34 | `tests/resumeDocumentOutcomeContract.test.ts:174:37` | TS2353 | B | Object literal may only specify known properties, and 'reason' does not exist in type '{ readonly status: "SUCCESS"; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number \| undefined; readonly diagnostic?: Readonly<...> \| undefined; }'. | Existing classified-stage fixture reason/type mismatch; identical baseline diagnostic. |
| 35 | `tests/resumeDocumentOutcomeContract.test.ts:175:41` | TS2322 | B | Type '"NO_USABLE_TEXT"' is not assignable to type 'HardFailureReason'. | Existing classified-stage fixture reason/type mismatch; identical baseline diagnostic. |
| 36 | `tests/resumeDocumentOutcomeContract.test.ts:198:39` | TS2353 | B | Object literal may only specify known properties, and 'reason' does not exist in type '{ readonly status: "SUCCESS"; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number \| undefined; readonly diagnostic?: Readonly<...> \| undefined; }'. | Existing classified-stage fixture reason/type mismatch; identical baseline diagnostic. |
| 37 | `tests/resumeDocumentOutcomeContract.test.ts:206:41` | TS2322 | B | Type '"UNSUPPORTED_VALID_REPRESENTATION"' is not assignable to type 'HardFailureReason'. | Existing classified-stage fixture reason/type mismatch; identical baseline diagnostic. |
| 38 | `tests/resumeParser.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 39 | `tests/resumeParser.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 40 | `tests/resumeParser.test.ts:3:31` | TS2591 | C | Cannot find name 'node:url'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 41 | `tests/resumeParserHardening.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 42 | `tests/resumeParserHardening.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 43 | `tests/resumeStructuredExtraction.test.ts:1:30` | TS2591 | C | Cannot find name 'node:fs'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |
| 44 | `tests/resumeStructuredExtraction.test.ts:2:25` | TS2591 | C | Cannot find name 'node:path'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig. | Missing @types/node; explicit node type-library probe returned TS2688. |

## Complete Current and Baseline Output

Both probes produced this exact output with exit code 1; multiline type details
are retained, rather than counting continuation lines as additional errors.

```text
src/analyzers/sectionDetector.ts(49,20): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/parsers/pdfLineReconstructor.ts(61,44): error TS2339: Property 'env' does not exist on type 'ImportMeta'.
src/parsers/pdfResumeParser.ts(2,26): error TS2307: Cannot find module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' or its corresponding type declarations.
tests/helpers/anonymousPdfGraphicsHarness.ts(120,28): error TS2349: This expression is not callable.
  Type 'Error' has no call signatures.
tests/helpers/anonymousPdfGraphicsHarness.ts(121,10): error TS2339: Property 'matrix' does not exist on type 'undefined'.
tests/helpers/anonymousPdfGraphicsHarness.ts(121,18): error TS2339: Property 'strokeColor' does not exist on type 'undefined'.
tests/helpers/anonymousPdfGraphicsHarness.ts(121,31): error TS2339: Property 'fillColor' does not exist on type 'undefined'.
tests/helpers/anonymousPdfGraphicsHarness.ts(121,42): error TS2339: Property 'lineWidth' does not exist on type 'undefined'.
tests/pdfLineReconstruction.test.ts(1,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfLineReconstruction.test.ts(2,31): error TS2591: Cannot find name 'node:url'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfPageCoordinateCompatibility.test.ts(1,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfPageCoordinateCompatibility.test.ts(2,31): error TS2591: Cannot find name 'node:url'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfPageCoordinateCompatibility.test.ts(7,8): error TS2305: Module '"pdfjs-dist/legacy/build/pdf.mjs"' has no exported member 'TextItem'.
tests/pdfPageGeometryAdapterContract.test.ts(90,36): error TS2345: Argument of type '(view: number | undefined) => void' is not assignable to parameter of type '(...args: [] | [number, number, number] | [number, number, number, number, number]) => Awaitable<void>'.
  Types of parameters 'view' and 'args' are incompatible.
    Type '[] | [number, number, number] | [number, number, number, number, number]' is not assignable to type '[view: number | undefined]'.
      Type '[]' is not assignable to type '[view: number | undefined]'.
        Source has 0 element(s) but target requires 1.
tests/pdfPageGeometryAdapterContract.test.ts(91,42): error TS2322: Type 'number | undefined' is not assignable to type 'readonly number[]'.
  Type 'undefined' is not assignable to type 'readonly number[]'.
tests/pdfPageGeometryAdapterContract.test.ts(100,59): error TS2345: Argument of type '(view: number) => void' is not assignable to parameter of type '(...args: [number, string, number, number] | [number, number, number, number]) => Awaitable<void>'.
  Types of parameters 'view' and 'args' are incompatible.
    Type '[number, string, number, number] | [number, number, number, number]' is not assignable to type '[view: number]'.
      Type '[number, string, number, number]' is not assignable to type '[view: number]'.
        Source has 4 element(s) but target allows only 1.
tests/pdfPageLayoutEvidenceInternalContract.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfPageLayoutEvidenceInternalContract.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfPageLayoutEvidenceInternalContract.test.ts(252,36): error TS2488: Type 'ArrayLike<number>' must have a '[Symbol.iterator]()' method that returns an iterator.
tests/pdfPageReconstructionHandoffContract.test.ts(169,76): error TS2488: Type 'ArrayLike<number>' must have a '[Symbol.iterator]()' method that returns an iterator.
tests/pdfParserPageAdmissionContract.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfParserPageAdmissionContract.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfRegionOwnershipAdjudication.test.ts(2,18): error TS2307: Cannot find module '../docs/investigations/rp-089-blinded-layouts.html?raw' or its corresponding type declarations.
tests/pdfVisualGroupFormationPolicyContract.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfVisualGroupFormationPolicyContract.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfVisualGroupGroundTruthContract.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfVisualGroupGroundTruthContract.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfVisualGroupResultContract.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/pdfVisualGroupResultContract.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeDocumentOutcomeContract.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeDocumentOutcomeContract.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeDocumentOutcomeContract.test.ts(3,31): error TS2591: Cannot find name 'node:url'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeDocumentOutcomeContract.test.ts(173,37): error TS2353: Object literal may only specify known properties, and 'reason' does not exist in type '{ readonly status: "SUCCESS"; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number | undefined; readonly diagnostic?: Readonly<...> | undefined; }'.
tests/resumeDocumentOutcomeContract.test.ts(174,37): error TS2353: Object literal may only specify known properties, and 'reason' does not exist in type '{ readonly status: "SUCCESS"; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number | undefined; readonly diagnostic?: Readonly<...> | undefined; }'.
tests/resumeDocumentOutcomeContract.test.ts(175,41): error TS2322: Type '"NO_USABLE_TEXT"' is not assignable to type 'HardFailureReason'.
tests/resumeDocumentOutcomeContract.test.ts(198,39): error TS2353: Object literal may only specify known properties, and 'reason' does not exist in type '{ readonly status: "SUCCESS"; readonly format: ResumeFileType; readonly stage: SafeDiagnosticStage; readonly pageNumber?: number | undefined; readonly diagnostic?: Readonly<...> | undefined; }'.
tests/resumeDocumentOutcomeContract.test.ts(206,41): error TS2322: Type '"UNSUPPORTED_VALID_REPRESENTATION"' is not assignable to type 'HardFailureReason'.
tests/resumeParser.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeParser.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeParser.test.ts(3,31): error TS2591: Cannot find name 'node:url'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeParserHardening.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeParserHardening.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeStructuredExtraction.test.ts(1,30): error TS2591: Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
tests/resumeStructuredExtraction.test.ts(2,25): error TS2591: Cannot find name 'node:path'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.
```

