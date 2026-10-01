# Phase 6B — 104 Browser Connector Prototype

This unpacked Manifest V3 extension is an isolated feasibility prototype. It is not connected to Job Quest production code.

## Scope

- Runs only after the user clicks **讀取目前職缺** in the extension popup.
- Accepts only the Phase 6B audit page: `keyword=前端工程師` and `area=6001008000`.
- Reads at most the first 10 already-rendered `.job-list-container` elements.
- Makes no network request and does not open detail pages.
- Does not read cookies, history, accounts, resumes, Gmail, or other tabs.

## Permissions

- `activeTab`: temporary access to the current tab after the user invokes the extension.
- `scripting`: injects the packaged `extract-jobs.js` content script into that tab.

There are no `host_permissions`, `cookies`, `history`, `tabs`, `downloads`, or `<all_urls>` permissions.

## Manual loading

Load this directory as an unpacked extension in Desktop Chromium, open the specified public 104 search page, open the extension popup, and click **讀取目前職缺**.

The popup and its console print the extracted JSON. Verify 3–5 rows against the visible 104 cards before treating the output as accepted.
