# P2LRN: homepage image and cache performance fix (2026-11-06)

## Measurement
The public homepage loaded five PNG carousel images with 276,457 bytes of decoded image resources. The initial network graph (Chrome, cache disabled) totalled approximately 504–513 KB of resources, with the five PNG screenshots accounting for over half. Repeated 4× CPU-throttled mobile tests showed variable LCP results, including one 4.2-second run; a single run should not be interpreted as a stable field percentile.

## Safe implementation
The same five images are now delivered preferentially as versioned 960×608 WebP resources (Pillow 12, quality 82, Lanczos), keeping the original PNG sources unchanged and referenced as fallbacks using <picture>. Combined WebP size is 129,804 bytes: 146,653 fewer bytes, 53.0% reduction in image bytes. The six-slide carousel, interactions, video, captions and accessibility labels were preserved. HTML changes were made in both languages, without changing Studio or course data.

The five versioned WebP assets can use immutable browser caching. Unversioned CSS and JS use only a short five-minute cache to avoid prolonged stale security fixes. The HTML remains revalidated.

## Validation
A pre-deployment local HTTP proxy and isolated Chrome loaded all five WebPs in Spanish and English. The image element bounding sizes matched the baseline, the video remained present, carousel slide click navigation worked, and no JS exceptions were observed. The proxy's first-page timing is not a reliable production timing comparison because its TTFB varied: use only the measured bytes as a deterministic improvement. Run `node scripts/verify-homepage-optimized.mjs` after checkout, then check Netlify published SHA, live image MIME and Cache-Control headers, and actual browser FCP/LCP after deployment.
