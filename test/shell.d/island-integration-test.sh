#!/bin/bash

set -euo pipefail

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/base-test.sh"

require_command node

validation_output=$("$ROOT/bin/omarchy-plugin-validate" "$ROOT/shell/plugins/island" 2>&1 || true)
grep -qF "uses the reserved omarchy.* namespace" <<<"$validation_output" ||
  fail "island remains a first-party-only plugin"
pass "island remains a first-party-only plugin"

run_node_test <<'JS'
const fs = require('fs')

function source(relativePath) {
  return fs.readFileSync(root + '/' + relativePath, 'utf8')
}

const shell = source('shell/shell.qml')
const broker = source('shell/services/ActivityBroker.qml')
const service = source('shell/plugins/island/Service.qml')
const fixture = source('shell/plugins/island/IslandFixture.qml')
const manifest = JSON.parse(source('shell/plugins/island/manifest.json'))
const model = requireFromRoot('shell/plugins/island/ActivityModel.js')

assertEqual((shell.match(/ActivityBroker\s*\{/g) || []).length, 1, 'shell constructs exactly one activity broker')
assert(/property\s+ActivityBroker\s+activityBroker\s*:\s*ActivityBroker\s*\{\s*\}/.test(shell), 'shell exposes its activity broker')
assert(/key\s*===\s*"omarchy\.island"\s*\?\s*\{\s*activityBroker:\s*shell\.activityBroker\s*\}\s*:\s*\(\{\}\)/.test(shell), 'shell limits broker injection to the island service')
assert(/createObject\(serviceHost,\s*initialProperties\)/.test(shell), 'shell injects initial properties before service completion')
assert(/required\s+property\s+var\s+activityBroker/.test(service), 'island service requires the injected broker')
assert(/Connections\s*\{[\s\S]*target:\s*root\.activityBroker/.test(service), 'island service receives broker commands')
assert(!/property\s+var\s+(state|activitiesByKey)/.test(broker), 'broker owns no island state')
assert(!/\bTimer\b/.test(broker), 'broker owns no expiry timer')
assert(/property\s+var\s+state:\s*ActivityModel\.initialState\(\)/.test(service), 'service owns the island state')
assert(/\bTimer\s*\{/.test(service), 'service owns the expiry timer')

assertDeepEqual(manifest.kinds, ['service', 'bar-widget'], 'manifest declares the exact island entry point kinds')
assertDeepEqual(manifest.entryPoints, { service: 'Service.qml', barWidget: 'BarWidget.qml' }, 'manifest declares the island entry points')
assertEqual(manifest.keepLoaded, true, 'manifest keeps the island service loaded')

const hostile = model.reduce(model.initialState(), {
  type: 'publish',
  activity: { source: '', id: 'bad' }
}, { nowMs: 1000, focusedScreen: 'FIXTURE-1' })
assertEqual(hostile.accepted, false, 'model rejects hostile fixture payloads')
const minimal = model.reduce(model.initialState(), {
  type: 'publish',
  activity: {
    source: 'fixture',
    id: 'minimal',
    revision: 1,
    priority: 'normal',
    relevance: 50,
    createdAt: 1000,
    updatedAt: 1000,
    expiresAt: 0,
    target: { mode: 'all' },
    minimal: { icon: '●' },
    actions: []
  }
}, { nowMs: 1000, focusedScreen: 'FIXTURE-1' })
assertEqual(minimal.accepted, true, 'minimal fixture activity remains valid')
assert(/property\s+var\s+_serviceLoads/.test(shell), 'service loader records one pending load per plugin id')
assert(/existingLoad\.epoch\s*===\s*_serviceLoadEpoch/.test(shell), 'repeated service syncs reuse an in-flight load claim')
assert(/_serviceLoads\[key\]\s*!==\s*load/.test(shell), 'stale service callbacks are rejected')
assert(/load\.url\s*!==\s*currentUrl/.test(shell), 'service callbacks reject changed entry-point URLs')
assert(/pluginRegistry\.isEnabled\(key\)/.test(shell), 'service callbacks reject disabled plugins')
assertEqual((shell.match(/_serviceLoadEpoch\s*\+=\s*1/g) || []).length, 1, 'only service unload invalidates the load epoch')
assert(/function\s+serviceKeepLoaded/.test(shell) && /if\s*\(serviceKeepLoaded\(existingId\)\)/.test(shell), 'keepLoaded services retain identity across rescans')

assert(/target:\s*"omarchy-island-fixture"/.test(fixture), 'fixture has one fixed IPC target')
assert(/import\s+Quickshell\.Io/.test(fixture), 'fixture imports the IPC module')
assert(/activityBroker:\s*root\.activityBroker/.test(service), 'service gives the fixture the injected broker')
assert(/root\.activityBroker\.deliver\(command\)/.test(fixture), 'fixture commands cross the activity broker')
assert(!/service\.dispatch\(/.test(fixture), 'fixture does not bypass the activity broker')
for (const method of ['ping', 'status', 'reset', 'compact', 'minimal', 'two', 'alerting', 'expanded', 'expiry', 'malformed']) {
  assert(new RegExp('function\\s+' + method + '\\(\\)').test(fixture), 'fixture exposes fixed ' + method + ' scenario')
}
assert(/ISLAND_FIXTURE_PASS state=/.test(fixture), 'fixture returns bounded pass output')
assert(/ISLAND_FIXTURE_REJECT reason=/.test(fixture), 'fixture returns bounded rejection output')
assert(!/function\s+(publish|update|end|invoke)\s*\(/.test(fixture), 'fixture accepts no arbitrary activity commands')
JS
