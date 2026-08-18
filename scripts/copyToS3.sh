#!/usr/bin/env bash

# Stop immediately on error
set -e

S3_BUCKET="$1"
if [[ -z "$1" ]]; then
  S3_BUCKET=connections-ui-test
fi

### Deploy code by copying build output to S3

cd out
# Cache "forever" (one year), which is only ever safe for a content-hashed URL:
# everything under _next/ carries a build hash in its filename, so changed bytes
# mean a changed URL and nothing ever has to be evicted.
#
# This is an allowlist rather than a list of excluded extensions, because the
# failure directions are not symmetric. A path wrongly marked immutable cannot be
# corrected for a year — `immutable` tells the browser not to revalidate at all,
# not on a reload, not when the origin has been right for weeks. A path wrongly
# left out of the allowlist merely loses caching it can be given back at any time.
# An extension blocklist fails the dangerous way every time someone adds a file
# type nobody listed; robots.txt was exactly that, and it would have shipped
# pinned for a year the first time it was generated.
aws s3 sync . "s3://$S3_BUCKET/" --exclude "*" --include "_next/*" \
  --metadata-directive REPLACE --cache-control "public, max-age=31536000, immutable"
# Do not cache: every stable URL whose bytes change — page HTML, robots.txt, the
# sitemaps, the brand assets.
#
# This is `cp --recursive` and not `sync` because `sync` skips a file whose size
# and timestamp already match, and a skipped object keeps whatever Cache-Control
# it was last written with. A header fix would never reach a file that had not
# otherwise changed.
aws s3 cp . "s3://$S3_BUCKET/" --recursive --exclude "_next/*" \
  --cache-control "public, no-cache"
# Cleanup unused files
aws s3 sync . "s3://$S3_BUCKET/" --delete
