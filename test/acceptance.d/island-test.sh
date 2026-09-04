#!/bin/bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/base-test.sh"

fixture() {
  omarchy-shell omarchy-island-fixture "$@"
}

fixture_ready() {
  [[ $(fixture ping 2>/dev/null) == "ISLAND_FIXTURE_PASS state=ready revision="* ]]
}

reset_fixture() {
  fixture reset >/dev/null 2>&1 || true
}
trap reset_fixture EXIT

assert_fixture() {
  local scenario="$1"
  local expected="$2"
  local output

  output=$(fixture "$scenario")
  [[ $output == "$expected" ]] || fail "island $scenario fixture passes" "expected: $expected actual: $output"
  printf '%s\n' "$output"
  pass "island $scenario fixture passes"
}

wait_until "island fixture IPC becomes ready" 30 fixture_ready
screenshot "success-island-i1-shell-startup"

assert_fixture compact "ISLAND_FIXTURE_PASS state=compact revision=1"
assert_fixture minimal "ISLAND_FIXTURE_PASS state=minimal revision=1"
assert_fixture two "ISLAND_FIXTURE_PASS state=compact revision=2"
assert_fixture alerting "ISLAND_FIXTURE_PASS state=alerting revision=2"
assert_fixture expanded "ISLAND_FIXTURE_PASS state=expanded revision=2"
assert_fixture expiry "ISLAND_FIXTURE_PASS state=compact revision=1"
expiry_complete() {
  [[ $(fixture status 2>/dev/null) == "ISLAND_FIXTURE_PASS state=idle revision=2" ]]
}
wait_until "island service expires activity through its timer" 10 expiry_complete

malformed=$(fixture malformed)
[[ $malformed == "ISLAND_FIXTURE_REJECT reason="* ]] || fail "island malformed fixture is rejected" "actual: $malformed"
printf '%s\n' "$malformed"
pass "island malformed fixture is rejected"

assert_fixture compact "ISLAND_FIXTURE_PASS state=compact revision=1"
before_rescan=$(fixture status)
omarchy-shell shell rescanPlugins >/dev/null || fail "island plugin rescan starts"
wait_until "island fixture returns after rescan" 30 fixture_ready
after_rescan=$(fixture status)
[[ $after_rescan == "$before_rescan" ]] || fail "island service state survives rescan" "before: $before_rescan after: $after_rescan"
pass "island service state survives rescan"

reset_fixture
trap - EXIT
