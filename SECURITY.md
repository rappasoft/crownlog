# Security policy

Please report suspected vulnerabilities privately to the repository maintainer rather than opening a public issue. Include reproduction steps, affected versions, and the potential impact when possible.

## Price-checking boundary

Crownlog fetches user-supplied product URLs on the server. Checks are restricted to public HTTPS hostnames, reject credentials and raw IP addresses, revalidate redirects, time out, and cap response size. Changes that broaden this boundary should receive focused security review.

## Supported version

The `braces` npm override uses the local MIT-licensed copy in `vendor/braces/` because [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) has no upstream patched release. This copy limits brace/parenthesis nesting and recursive AST traversal to 100 blocks, with regression tests in `tests/braces.unit.test.ts`. Replace the local copy and override when an upstream release fixes the advisory.

Until the first stable release, security fixes are applied to the latest commit on the default branch.
