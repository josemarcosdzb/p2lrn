<?php
// P2LRN Studio PHP Host integration: DENY by default until all three checks
// are configured against the hosting application's real session and ACLs.
function p2lrn_studio_host_authenticate(): bool {
    return false;
}
function p2lrn_studio_host_authorize(string $operation, string $coursePath): bool {
    return false;
}
function p2lrn_studio_host_check_csrf(): bool {
    return false;
}
function p2lrn_studio_require_authorization(string $operation, string $coursePath): void {
    $status=403;
    $error='COURSE_ACCESS_DENIED';
    try {
        if (p2lrn_studio_host_authenticate() !== true) {
            $status=401;
            $error='AUTHENTICATION_REQUIRED';
        } elseif (p2lrn_studio_host_authorize($operation, $coursePath) === true &&
                  p2lrn_studio_host_check_csrf() === true) {
            return;
        }
    } catch (Throwable $ignored) {
        // Never leak session details to the client.
    }
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode(['ok'=>false,'error'=>$error]);
    exit;
}
