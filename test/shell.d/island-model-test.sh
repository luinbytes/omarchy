#!/bin/bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/base-test.sh"

run_node_test <<'JS'
const suite = requireFromRoot('test/shell.d/fixtures/island/activity-model-cases.js')

for (const testCase of suite.cases) {
  try {
    testCase.run()
    pass(testCase.name)
  } catch (error) {
    fail(testCase.name, String(error && error.stack ? error.stack : error))
  }
}
JS
