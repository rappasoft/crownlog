# Security policy

Please report suspected vulnerabilities privately to the repository maintainer rather than opening a public issue. Include reproduction steps, affected versions, and the potential impact when possible.

## Price-checking boundary

Crownlog fetches user-supplied product URLs on the server. Checks are restricted to public HTTPS hostnames, reject credentials and raw IP addresses, revalidate redirects, time out, and cap response size. Changes that broaden this boundary should receive focused security review.

## Supported version

Until the first stable release, security fixes are applied to the latest commit on the default branch.
