# Privacy and publication boundary

This repository is designed for public GitHub Pages hosting.

- The exact family anchor address is an encrypted GitHub Actions secret and must never be committed, logged, or rendered.
- The public assumptions intentionally omit private income, account, loan-approval, and detailed taxpayer information.
- Listing addresses and public real-estate records are included only because they are the subject of the property research.
- Automated validation rejects a dataset that contains the configured private anchor or its street name.
- OneHome is supported only through sanitized snapshots. Token-free property paths may be published, but access tokens, token-bearing URLs, contact identifiers, and private email addresses are rejected by validation and must never be committed. The dashboard may combine a pasted current OneHome URL with those property paths in page memory only; it does not use browser storage.

If a future feature requires private notes, family votes, authentication, or stored personal information, it must use a private backend rather than this static site.
