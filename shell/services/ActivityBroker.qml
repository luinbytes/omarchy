import QtQuick

Item {
  id: root

  signal commandRequested(var command)

  function deliver(command) {
    root.commandRequested(command)
    return true
  }

  function publish(activity) { return deliver({ type: "publish", activity: activity }) }
  function update(activity) { return deliver({ type: "update", activity: activity }) }
  function end(source, id, revision) {
    var command = { type: "end", source: source, id: id }
    if (revision !== undefined) command.revision = revision
    return deliver(command)
  }
  function tick(leaseToken) {
    var command = { type: "tick" }
    if (leaseToken !== undefined) command.leaseToken = leaseToken
    return deliver(command)
  }
  function expand(source, id, screen, reason) {
    var command = { type: "expand", source: source, id: id }
    if (screen !== undefined) command.screen = screen
    if (reason !== undefined) command.reason = reason
    return deliver(command)
  }
  function collapse(reason) {
    var command = { type: "collapse" }
    if (reason !== undefined) command.reason = reason
    return deliver(command)
  }
  function invoke(source, id, actionId) {
    return deliver({ type: "invoke", source: source, id: id, actionId: actionId })
  }
}
