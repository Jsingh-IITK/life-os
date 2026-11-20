#!/usr/bin/env bash
# Watch the CI run for the current HEAD, not whatever is newest.
#
# Reading `gh run list --limit 1` races: a newer run may be queued, or the run
# for HEAD may not exist yet, and both give you another commit's results. This
# has caused several wrong conclusions.
set -euo pipefail

sha=$(git rev-parse HEAD)
short=${sha:0:7}

for _ in $(seq 1 30); do
  run=$(gh run list --limit 15 --json databaseId,headSha \
        -q "[.[] | select(.headSha==\"$sha\")][0].databaseId" 2>/dev/null || true)
  [ -n "${run:-}" ] && [ "$run" != "null" ] && break
  sleep 4
done

if [ -z "${run:-}" ] || [ "$run" = "null" ]; then
  echo "no CI run found for $short"; exit 1
fi

echo "watching run $run for $short"
gh run watch "$run" --exit-status >/dev/null 2>&1 || true
gh run view "$run" --json jobs -q '.jobs[] | "\(.name): \(.conclusion)"'

gh run view "$run" --log 2>&1 \
  | sed -E 's/^.*[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]+Z //' \
  | grep -E "test\.sql \.\.|^not ok|^# Failed|^# +(have|want)|died:|caught:|Result:|Files=" \
  | grep -vE "Pulling|layer" | head -30
