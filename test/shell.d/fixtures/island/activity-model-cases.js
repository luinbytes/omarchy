var model = require(process.env.ROOT + "/shell/plugins/island/ActivityModel.js")

function activity(overrides) {
  var value = {
    source: "fixture",
    id: "activity",
    revision: 1,
    priority: "normal",
    relevance: 50,
    createdAt: 100,
    updatedAt: 100,
    expiresAt: 0,
    target: { mode: "all" },
    compact: { icon: "●", label: "Fixture" },
    minimal: { icon: "●" },
    expanded: { center: { label: "Fixture activity" } },
    actions: [{ id: "open", label: "Open", role: "primary", enabled: true }]
  }
  var keys = Object.keys(overrides || {})
  for (var i = 0; i < keys.length; i++) value[keys[i]] = overrides[keys[i]]
  return value
}

function context(nowMs, focusedScreen, extra) {
  var value = { nowMs: nowMs, focusedScreen: focusedScreen || "" }
  var keys = Object.keys(extra || {})
  for (var i = 0; i < keys.length; i++) value[keys[i]] = extra[keys[i]]
  return value
}

function publish(state, value, nowMs, focusedScreen) {
  return model.reduce(state, { type: "publish", activity: value }, context(nowMs, focusedScreen))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function equal(actual, expected, message) {
  var left = JSON.stringify(actual)
  var right = JSON.stringify(expected)
  if (left !== right) throw new Error(message + "\nexpected " + right + "\nactual " + left)
}

function rejected(result, text) {
  assert(result.accepted === false, "expected rejection for " + text)
  assert(result.error.length > 0, "rejection needs a reason for " + text)
}

var cases = [
  {
    name: "publish normalizes a plain activity and selects compact primary",
    run: function() {
      var result = publish(model.initialState(), activity(), 100, "DP-1")
      assert(result.accepted, result.error)
      assert(result.state.presentation.phase === "compact", "compact phase selected")
      assert(result.state.presentation.primaryKey === model.identityKey("fixture", "activity"), "primary key is stable")
      assert(result.state.activitiesByKey[model.identityKey("fixture", "activity")].minimal.icon === "●", "presentation is retained")
    }
  },
  {
    name: "replacement requires a newer revision and never mutates input",
    run: function() {
      var first = activity()
      var before = JSON.stringify(first)
      var state = publish(model.initialState(), first, 100, "DP-1").state
      var stateBefore = JSON.stringify(state)
      var stale = publish(state, activity({ updatedAt: 100 }), 100, "DP-1")
      rejected(stale, "stale revision")
      var replacement = publish(state, activity({ revision: 2, updatedAt: 120, compact: { label: "Updated" } }), 120, "DP-1")
      assert(replacement.accepted, replacement.error)
      assert(JSON.stringify(first) === before, "publish does not mutate the command")
      assert(JSON.stringify(state) === stateBefore, "reduce does not mutate prior state")
      assert(replacement.state.activitiesByKey[model.identityKey("fixture", "activity")].revision === 2, "replacement is keyed")
    }
  },
  {
    name: "priority, relevance, time, and key produce deterministic primary and secondary",
    run: function() {
      var state = model.initialState()
      state = publish(state, activity({ id: "normal", relevance: 99 }), 100, "DP-1").state
      state = publish(state, activity({ id: "urgent", priority: "high", relevance: 1 }), 100, "DP-1").state
      var result = publish(state, activity({ id: "other", priority: "high", relevance: 1 }), 100, "DP-1")
      assert(result.state.presentation.primaryKey === model.identityKey("fixture", "other"), "lexical key breaks a tie")
      assert(result.state.presentation.secondaryKey === model.identityKey("fixture", "urgent"), "secondary activity is retained")
    }
  },
  {
    name: "target screens select only the focused destination",
    run: function() {
      var state = publish(model.initialState(), activity({ target: { mode: "screen", screen: "DP-2" } }), 100, "DP-1").state
      assert(state.presentation.phase === "idle", "unfocused activity stays hidden")
      var result = model.reduce(state, { type: "tick" }, context(100, "DP-2"))
      assert(result.state.presentation.primaryKey === model.identityKey("fixture", "activity"), "focused target appears")
    }
  },
  {
    name: "transient pulse restores the prior activity after its bounded lease",
    run: function() {
      var state = publish(model.initialState(), activity({ id: "media", priority: "normal" }), 100, "DP-1").state
      var pulse = activity({ id: "pulse", priority: "low", updatedAt: 110, transientMs: 500, compact: { icon: "!", label: "Pulse" } })
      var alert = publish(state, pulse, 110, "DP-1")
      assert(alert.state.presentation.phase === "alerting", "pulse presents as alerting")
      assert(alert.state.presentation.underlyingKey === model.identityKey("fixture", "media"), "underlying activity is retained")
      assert(alert.effects.length === 0, "expiry scheduling stays outside reducer effects")
      assert(model.nextWakeAt(alert.state) === 610, "next wake is the transient lease deadline")
      var restored = model.reduce(alert.state, { type: "tick", leaseToken: alert.state.presentation.leaseToken }, context(610, "DP-1"))
      assert(restored.state.presentation.phase === "compact", "pulse restores compact state")
      assert(restored.state.presentation.selectedKey === model.identityKey("fixture", "media"), "prior activity is selected")
      assert(!restored.state.activitiesByKey[model.identityKey("fixture", "pulse")], "pulse is removed after lease")
      assert(model.nextWakeAt(restored.state) === null, "restored state has no deadline")
    }
  },
  {
    name: "next wake selects the earliest activity expiry",
    run: function() {
      var state = model.initialState()
      state = publish(state, activity({ id: "later", expiresAt: 500 }), 100, "DP-1").state
      state = publish(state, activity({ id: "earlier", expiresAt: 300 }), 100, "DP-1").state
      assert(model.nextWakeAt(state) === 300, "earliest expiry is selected")
      assert(model.nextWakeAt(model.initialState()) === null, "idle state has no deadline")
    }
  },
  {
    name: "tick explicitly removes expired activities",
    run: function() {
      var state = publish(model.initialState(), activity({ expiresAt: 200 }), 100, "DP-1").state
      var result = model.reduce(state, { type: "tick" }, context(200, "DP-1"))
      assert(result.accepted, result.error)
      assert(Object.keys(result.state.activitiesByKey).length === 0, "expired activity is removed")
      assert(result.state.presentation.phase === "idle", "expiry returns to idle")
    }
  },
  {
    name: "expand, collapse, and anchor loss preserve a valid presentation",
    run: function() {
      var state = publish(model.initialState(), activity(), 100, "DP-1").state
      var selected = model.reduce(state, { type: "expand" }, context(100, "DP-1"))
      assert(selected.state.presentation.phase === "expanded", "current selection expands")
      var expanded = model.reduce(state, { type: "expand", source: "fixture", id: "activity" }, context(100, "DP-1"))
      assert(expanded.state.presentation.phase === "expanded", "activity expands")
      var lost = model.reduce(expanded.state, { type: "tick" }, context(100, "DP-1", { anchorAvailable: false }))
      assert(lost.state.presentation.phase === "compact", "anchor loss collapses")
      assert(lost.state.presentation.reason === "anchor-lost", "anchor loss is observable")
      var collapsed = model.reduce(expanded.state, { type: "collapse", reason: "user" }, context(100, "DP-1"))
      assert(collapsed.state.presentation.phase === "compact", "explicit collapse returns to compact")
    }
  },
  {
    name: "ending the selected activity selects the remaining activity",
    run: function() {
      var state = publish(model.initialState(), activity({ id: "first", priority: "normal" }), 100, "DP-1").state
      state = publish(state, activity({ id: "second", priority: "high" }), 100, "DP-1").state
      var ended = model.reduce(state, { type: "end", source: "fixture", id: "second", revision: 1 }, context(100, "DP-1"))
      assert(ended.accepted, ended.error)
      assert(ended.state.presentation.selectedKey === model.identityKey("fixture", "first"), "selection moves after removal")
    }
  },
  {
    name: "invoke returns a symbolic owner effect",
    run: function() {
      var state = publish(model.initialState(), activity(), 100, "DP-1").state
      var result = model.reduce(state, { type: "invoke", source: "fixture", id: "activity", actionId: "open" }, context(100, "DP-1"))
      assert(result.accepted, result.error)
      equal(result.effects, [{ type: "invoke-owner", key: model.identityKey("fixture", "activity"), actionId: "open" }], "invoke effect remains symbolic")
    }
  },
  {
    name: "boundary validation rejects hostile, malformed, and unsupported payloads",
    run: function() {
      var state = model.initialState()
      rejected(publish(state, activity({ source: "" }), 100, "DP-1"), "missing identity")
      rejected(publish(state, activity({ updatedAt: NaN }), 100, "DP-1"), "NaN time")
      rejected(publish(state, activity({ createdAt: NaN }), 100, "DP-1"), "NaN creation time")
      rejected(publish(state, activity({ target: { mode: "screen" } }), 100, "DP-1"), "invalid target")
      rejected(publish(state, activity({ actions: [{ id: "open", label: "Open", command: "rm" }] }), 100, "DP-1"), "unsupported action")
      rejected(publish(state, activity({ compact: { label: "ok", arbitrary: true } }), 100, "DP-1"), "unsupported presentation")
      rejected(publish(state, activity({ expiresAt: 99 }), 100, "DP-1"), "expired publication")
      rejected(model.reduce(state, { type: "unknown" }, context(100, "DP-1")), "unsupported command")
      rejected(model.reduce(state, { type: "expand", key: model.identityKey("fixture", "activity"), source: "fixture", id: "activity" }, context(100, "DP-1")), "ambiguous expand selector")
      rejected(model.reduce(state, { type: "invoke", key: model.identityKey("fixture", "activity"), source: "fixture", id: "activity", actionId: "open" }, context(100, "DP-1")), "ambiguous invoke selector")
      rejected(model.reduce(state, { type: "invoke", key: "__proto__", actionId: "open" }, context(100, "DP-1")), "unsafe internal key")
      rejected(model.reduce(state, { type: "publish", activity: activity({ compact: { label: function() {} } }) }, context(100, "DP-1")), "function value")
      var qobject = activity()
      qobject.objectName = "not a plain payload"
      rejected(publish(state, qobject, 100, "DP-1"), "QObject-like value")
    }
  }
]

if (typeof module !== "undefined") module.exports = { cases: cases }
