# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities privately, not in a public issue or
pull request.

Open a private advisory directly:
https://github.com/Bynn-Intelligence/zoreal-mark-safari/security/advisories/new

or open the repository's **Security** tab and choose **Report a vulnerability**.
The report is visible only to the maintainers.

We aim to acknowledge a report within 3 business days and to keep you updated as
we investigate. Please allow a reasonable window to ship a fix before any public
disclosure.

## Scope

This repository is the Safari extension for ZOREAL Mark and the Mac and iOS app
that carries it. The verification steps themselves live in
[zoreal-mark-verify](https://github.com/Bynn-Intelligence/zoreal-mark-verify),
and a flaw in a verification step belongs in that repository's advisory form.
Anything the extension does around the verifier, on a page, in the popup, in
the sign flow, in the background or in the containing app, belongs here.
