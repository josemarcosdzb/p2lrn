# Chamilo IMS/LTI compatibility (laboratory)

These are the actual, source-validated compatibility adaptations used in
the existing Chamilo 2.0.3 installation with PHP 8.3, Doctrine Persistence 3
and IMS/LTI plugin 1.9.0. They address bugs in the LMS plugin, not the
P2LRN provider. This directory is not a second provider or an LMS clone.

Problem and reference: https://github.com/chamilo/chamilo-lms/issues/9130

The original browser flow failed at the course tool configuration UI
(HTTP 500). Localized problems:
- Retired Doctrine repository alias and CTool.cId / CTool.link fields.
- Category::load receiving a course code where it expects an integer ID.
- Old Firebase JWT::decode calling convention used by item_return2.php.
- Deep Linking custom object not preserved, losing p2lrn_binding_id.
- Obsolete course-tool persistence, which must use native resource
  associations and CShortcut instead of the removed CTool APIs.
- Inconsistent Deep Linking callback course context.

The four patches are fail-closed against unexpected source layouts.
They modify PHP source during the Docker image build; they do not
insert scores, create users, change SQL tables or bypass authentication.

## Existing local QA image

The existing single QA image is:

    local/chamilo:2.0.3-p2lrn-lti-qa

It was built with Dockerfile.p2lrn-lti-qa in the existing AulaP2P Chamilo
instance. That Dockerfile includes COPY and RUN steps for the four PHP
scripts from its overrides directory. This is separate from the normal
P2LRN provider, which remains a single LTI 1.3 service.

For the existing instance, use Sync-LocalQA.ps1 with its explicit
InstanceDir parameter to verify or populate only the required patch
sources. The script refuses to overwrite different local files and
checks that the QA Dockerfile already includes the patch references.
Build normally from the existing instance; do not create another LMS.

The current QA Docker image built with all PHP syntax checks passing
on 10 November 2026. The running Chamilo app has the same fixes
applied in source, but has not been recreated from the new image.
A previous Chamilo course configuration screen returned HTTP 200
after the Doctrine and Gradebook fixes. A signed Deep Linking
selection has been shown in a real browser, but its newly patched
return and gradebook acceptance have NOT been certified end to end.

## Authentication and security

In this AulaP2P-managed laboratory the Caddy ingress redirects
unauthenticated GET /login to the central broker
/lms/acceder/chamilojose. It also intercepts Chamilo's documented
skipForcedRedirect=1 recovery query. Do not evade this policy with
synthetic tokens or unapproved internal URLs. Continue the real
teacher and learner UI sessions with accounts authorized by the broker.

An independent institution's Chamilo LMS need not use AulaP2P SSO
to install the P2LRN LTI provider: it keeps its own normal login.
The technical administrator registers the provider once. Teachers
subsequently use the provider's Deep Linking picker inside their LMS.

No grade passback or complete five-LMS certification is claimed.
Before enabling in a new version of Chamilo, revalidate the upstream
source contract and complete signed teacher -> learner -> official
gradebook proof. Do not distribute these QA patches as a universal
production fix.