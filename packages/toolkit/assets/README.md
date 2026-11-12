# P2LRN Windows file icon

The official Windows file icon is generated from the canonical
`deploy/netlify/site/p2lrn-mark.png` by
`node scripts/build-windows-icon.mjs`. It creates `p2lrn.ico`
in four resolutions: 16, 32, 48 and 256 pixels.

The ICO is a generated artifact, not committed to Git. This README keeps
the assets directory present on a clean checkout for the CDN source
snapshot before any `npm pack` generates the icon.

The `@p2lrn/toolkit` npm tarball includes the ICO and the Windows
registration script. Installation never modifies Windows registry
automatically; registration must be explicitly invoked by the user.
