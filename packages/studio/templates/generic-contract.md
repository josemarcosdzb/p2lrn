# Generic P2LRN Studio save contract

Expose POST __ENDPOINT__.
Accept the raw body as application/vnd.p2lrn+zip.
Read X-P2LRN-Filename and X-P2LRN-Path.
Save under __COURSE_PATH__/ by default and create it if missing.
Sanitize filenames and reject path traversal such as ../.
Return JSON with ok and filename.

Security requirement: protect the endpoint with the host application's authentication and authorization. Only trusted author/admin roles should be allowed to save courses. Do not expose this write endpoint anonymously.
