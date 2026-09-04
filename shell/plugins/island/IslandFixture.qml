import QtQuick
import Quickshell
import Quickshell.Io

QtObject {
  id: root

  required property var service
  required property var activityBroker
  property string lastRejection: ""

  function activity(id, revision, nowMs, extras) {
    var value = {
      source: "fixture",
      id: id,
      revision: revision,
      priority: "normal",
      relevance: 50,
      createdAt: nowMs,
      updatedAt: nowMs,
      expiresAt: 0,
      target: { mode: "all" },
      compact: { icon: "●", label: "Fixture" },
      actions: []
    }
    for (var key in extras) {
      if (extras[key] === undefined) delete value[key]
      else value[key] = extras[key]
    }
    return value
  }

  function stateResult(state) {
    return "ISLAND_FIXTURE_PASS state=" + state + " revision=" + service.state.revision
  }

  function rejectResult(reason) {
    return "ISLAND_FIXTURE_REJECT reason=" + String(reason || "rejected").replace(/\s+/g, "-")
  }

  function dispatch(command) {
    root.lastRejection = ""
    root.activityBroker.deliver(command)
    return root.lastRejection ? rejectResult(root.lastRejection) : stateResult(service.presentation.phase)
  }

  function reset() {
    service.resetFixtureState()
    return stateResult(service.presentation.phase)
  }

  Connections {
    target: root.service
    function onCommandRejected(reason) { root.lastRejection = reason }
  }

  IpcHandler {
    target: "omarchy-island-fixture"

    function ping(): string {
      return stateResult("ready")
    }

    function status(): string {
      return stateResult(service.presentation.phase)
    }

    function reset(): string {
      return root.reset()
    }

    function compact(): string {
      var nowMs = Date.now()
      root.reset()
      return root.dispatch({ type: "publish", activity: root.activity("compact", 1, nowMs, {}) })
    }

    function minimal(): string {
      var nowMs = Date.now()
      root.reset()
      return root.dispatch({ type: "publish", activity: root.activity("minimal", 1, nowMs, {
        compact: undefined,
        minimal: { icon: "●" }
      }) })
    }

    function two(): string {
      var nowMs = Date.now()
      root.reset()
      root.dispatch({ type: "publish", activity: root.activity("first", 1, nowMs, {}) })
      return root.dispatch({ type: "publish", activity: root.activity("second", 1, nowMs, {
        priority: "high"
      }) })
    }

    function alerting(): string {
      var nowMs = Date.now()
      root.reset()
      root.dispatch({ type: "publish", activity: root.activity("media", 1, nowMs, {}) })
      return root.dispatch({ type: "publish", activity: root.activity("pulse", 1, nowMs, {
        transientMs: 500
      }) })
    }

    function expanded(): string {
      var nowMs = Date.now()
      root.reset()
      root.dispatch({ type: "publish", activity: root.activity("expanded", 1, nowMs, {}) })
      return root.dispatch({ type: "expand", source: "fixture", id: "expanded" })
    }

    function expiry(): string {
      var nowMs = Date.now()
      root.reset()
      return root.dispatch({ type: "publish", activity: root.activity("expiry", 1, nowMs, {
        expiresAt: nowMs + 250
      }) })
    }

    function malformed(): string {
      root.reset()
      return root.dispatch({ type: "publish", activity: { source: "", id: "bad" } })
    }
  }
}
