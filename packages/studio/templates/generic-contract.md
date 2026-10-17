# Generic P2LRN Studio endpoint contract

Setup generates the same three Studio routes for every supported backend:

- POST __ENDPOINT__ saves a raw application/vnd.p2lrn+zip body under __COURSE_PATH__/.
- POST __READER_ENDPOINT__ accepts a document body and returns Reader JSON.
- POST __IMPORT_ENDPOINT__ accepts an external educational package and returns application/vnd.p2lrn+zip.

The generated p2lrn-studio-bridge.mjs uses @p2lrn/studio/server and @p2lrn/toolkit for Reader and external-package conversion. A custom backend can invoke it as:

node p2lrn-setup/p2lrn-studio-bridge.mjs read <filename> <content-type>
node p2lrn-setup/p2lrn-studio-bridge.mjs import <filename> <content-type>

Write the request body to stdin and return stdout unchanged. The read action returns JSON; the import action returns P2LRN binary bytes.

Production security requirement: `p2lrn-studio setup` generates only technical endpoints; it does not install or infer Host authentication and authorization. Before calling any of the three P2LRN helpers, the Host's server must verify its own session/token and authorize the principal for the requested course/tenant and operation (401/403 on failure). Enforce CSRF/origin checks when using cookie sessions, a restrictive CORS policy, request/body/archive size and rate limits, storage quotas and server-owned paths. Do not accept browser-provided arbitrary filesystem paths or store packages for another tenant; preserve the identity and persistence boundaries of the Host. The generated route is NOT safe to expose unauthenticated on the public Internet.
