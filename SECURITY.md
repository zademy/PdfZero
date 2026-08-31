# Security Policy

## Supported Versions

PDFZero is a client-side application with no backend. Only the latest version
(on `main`) receives security fixes.

| Version | Supported          |
| ------- | ------------------ |
| latest `main` / most recent release | :white_check_mark: |
| anything older                      | :x:                |

## Reporting a Vulnerability

Please use **GitHub's private vulnerability reporting**: go to the
**Security** tab of this repository and click **"Report a vulnerability"**.

- Do **not** open a public issue, discussion, or PR for a suspected vulnerability.
- Include steps to reproduce, affected browsers, and — if relevant — a minimal PDF sample.
- You can expect an acknowledgement within a few days. If the report is accepted,
  a fix will be released as soon as practical and credited to you if you wish.

## Scope Notes

- PDFZero runs entirely in the browser. There is no server that stores or
  processes user files.
- The only outbound network feature is the **opt-in AI translation** (EN↔ES),
  which sends page text snippets to the Z.AI GLM API using the API key the
  user configures in `.env.local` (`VITE_GLM_API_KEY`). Because Vite embeds
  `VITE_*` variables in the client bundle, that key must be a low-privilege,
  personal key — treat it as public-by-design, not as a project secret.
- Reports about the upstream project (bevinkatti/PdfZero) should follow the
  same channel on this fork, since upstream is unmaintained.
