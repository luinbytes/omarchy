import QtQuick
import "ActivityModel.js" as ActivityModel

Item {
  id: root

  property QtObject shell: null
  required property var activityBroker
  property string focusedScreen: ""
  property var state: ActivityModel.initialState()
  readonly property var activitiesByKey: root.state.activitiesByKey
  readonly property var presentation: root.state.presentation
  readonly property var nextWakeAt: ActivityModel.nextWakeAt(root.state)

  signal commandRejected(string reason)
  signal ownerActionRequested(string key, string actionId)

  function resetFixtureState() {
    root.state = ActivityModel.initialState()
    return root.state
  }

  function receive(command) {
    return dispatch(command, Date.now(), root.focusedScreen)
  }

  function dispatch(command, nowMs, targetScreen) {
    var result = ActivityModel.reduce(root.state, command, {
      nowMs: nowMs,
      focusedScreen: targetScreen === undefined ? root.focusedScreen : String(targetScreen)
    })
    if (!result.accepted) {
      root.commandRejected(result.error)
      return result
    }
    if (result.changed) root.state = result.state
    for (var i = 0; i < result.effects.length; i++) {
      var effect = result.effects[i]
      if (effect.type === "invoke-owner") root.ownerActionRequested(effect.key, effect.actionId)
    }
    return result
  }

  function publish(activity) { return receive({ type: "publish", activity: activity }) }
  function update(activity) { return receive({ type: "update", activity: activity }) }
  function end(source, id, revision) {
    var command = { type: "end", source: source, id: id }
    if (revision !== undefined) command.revision = revision
    return receive(command)
  }
  function tick() { return receive({ type: "tick" }) }
  function expand(source, id, screen, reason) {
    var command = { type: "expand", source: source, id: id }
    if (screen !== undefined) command.screen = screen
    if (reason !== undefined) command.reason = reason
    return receive(command)
  }
  function collapse(reason) {
    var command = { type: "collapse", reason: reason === undefined ? "user" : reason }
    return receive(command)
  }
  function invoke(source, id, actionId) {
    return receive({ type: "invoke", source: source, id: id, actionId: actionId })
  }

  function wakeInterval(wakeAt) {
    var delta = Number(wakeAt) - Date.now()
    if (!isFinite(delta) || delta <= 0) return 1
    return Math.min(2147483647, Math.max(1, Math.floor(delta)))
  }

  Connections {
    target: root.activityBroker
    function onCommandRequested(command) { root.receive(command) }
  }

  Timer {
    id: wakeTimer

    interval: root.nextWakeAt === null ? 0 : root.wakeInterval(root.nextWakeAt)
    repeat: false
    running: root.nextWakeAt !== null
    onTriggered: {
      root.tick()
      if (root.nextWakeAt !== null) wakeTimer.restart()
    }
  }

  IslandFixture {
    service: root
    activityBroker: root.activityBroker
  }
}
