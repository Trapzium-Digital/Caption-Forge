#!/usr/bin/env bash
# CI helper: run a command, and on failure turn the last lines of its output into the
# step's error annotation (visible on the run page without opening the full log).
#   scripts/ci-step.sh "Title" command args...
title=$1; shift
set -o pipefail
"$@" 2>&1 | tee "${RUNNER_TEMP:-/tmp}/step.log" && exit 0
echo "::error title=${title}::$(tail -n 60 "${RUNNER_TEMP:-/tmp}/step.log" | sed 's/%/%25/g;s/\r//' | awk '{printf "%s%%0A", $0}')"
exit 1
