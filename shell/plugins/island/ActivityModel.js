var PRIORITY_RANK = {
  low: 100,
  normal: 200,
  high: 300,
  critical: 400
}

var ACTIVITY_KEYS = {
  source: true,
  id: true,
  kind: true,
  revision: true,
  priority: true,
  relevance: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  transientMs: true,
  target: true,
  privacy: true,
  compact: true,
  minimal: true,
  expanded: true,
  actions: true
}

var COMMAND_KEYS = {
  publish: { type: true, activity: true },
  update: { type: true, activity: true },
  end: { type: true, source: true, id: true, revision: true },
  tick: { type: true, leaseToken: true },
  expand: { type: true, key: true, source: true, id: true, screen: true, reason: true },
  collapse: { type: true, reason: true },
  invoke: { type: true, key: true, source: true, id: true, actionId: true }
}

var SURFACE_KEYS = {
  icon: true,
  label: true,
  value: true,
  progress: true
}

var REGION_KEYS = {
  leading: true,
  center: true,
  trailing: true,
  bottom: true
}

var ACTION_KEYS = {
  id: true,
  label: true,
  role: true,
  enabled: true
}

var TARGET_KEYS = {
  mode: true,
  screen: true
}

var QObjectKeys = {
  objectName: true,
  destroyed: true,
  parent: true,
  children: true,
  metaObject: true,
  connect: true,
  disconnect: true,
  signals: true,
  slots: true
}

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function isObject(value) {
  return value !== null && typeof value === "object"
}

function isPlainObject(value) {
  if (!isObject(value) || Object.prototype.toString.call(value) !== "[object Object]") return false
  if (typeof Object.getPrototypeOf === "function") {
    var prototype = Object.getPrototypeOf(value)
    if (prototype !== null && prototype !== Object.prototype) return false
  }
  var keys = Object.keys(value)
  for (var i = 0; i < keys.length; i++) {
    if (own(QObjectKeys, keys[i])) return false
  }
  return true
}

function numberIsFinite(value) {
  return typeof value === "number" && isFinite(value)
}

function integer(value) {
  return numberIsFinite(value) && Math.floor(value) === value
}

function safeText(value, maximum, label) {
  if (typeof value !== "string") return { ok: false, error: label + " must be a string" }
  if (value.length < 1 || value.length > maximum) return { ok: false, error: label + " has an invalid length" }
  if (/[^\x20-\x7e\u00a0-\uffff]/.test(value)) return { ok: false, error: label + " contains control characters" }
  return { ok: true, value: value }
}

function optionalText(value, maximum, label) {
  if (value === undefined) return { ok: true, value: undefined }
  var result = safeText(value, maximum, label)
  if (!result.ok) return result
  return { ok: true, value: value }
}

function safeIdentity(value, label) {
  var result = safeText(value, 128, label)
  if (!result.ok) return result
  if (value === "__proto__" || value === "prototype" || value === "constructor" || value === "." || value === "..") return { ok: false, error: label + " is unsafe" }
  return result
}

function serializable(value, path, seen) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return { ok: true }
  if (typeof value === "number") return numberIsFinite(value) ? { ok: true } : { ok: false, error: path + " must be finite" }
  if (typeof value === "function") return { ok: false, error: path + " cannot be a function" }
  if (typeof value !== "object") return { ok: false, error: path + " must be serializable" }
  if (!isPlainObject(value) && !Array.isArray(value)) return { ok: false, error: path + " must be a plain value" }
  if (seen.indexOf(value) !== -1) return { ok: false, error: path + " cannot be cyclic" }
  seen.push(value)
  var keys = []
  if (Array.isArray(value)) {
    for (var arrayIndex = 0; arrayIndex < value.length; arrayIndex++) keys.push(arrayIndex)
  } else {
    keys = Object.keys(value)
  }
  for (var i = 0; i < keys.length; i++) {
    var child = value[keys[i]]
    var result = serializable(child, path + "[" + keys[i] + "]", seen)
    if (!result.ok) return result
  }
  seen.pop()
  return { ok: true }
}

function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (isPlainObject(value)) {
    var result = {}
    var keys = Object.keys(value)
    for (var i = 0; i < keys.length; i++) result[keys[i]] = clone(value[keys[i]])
    return result
  }
  return value
}

function rejectUnknown(object, allowed, label) {
  var keys = Object.keys(object)
  for (var i = 0; i < keys.length; i++) {
    if (!own(allowed, keys[i])) return { ok: false, error: label + " has unsupported field " + keys[i] }
  }
  return { ok: true }
}

function integerField(value, label, minimum, maximum) {
  if (!integer(value) || value < minimum || value > maximum) return { ok: false, error: label + " must be an integer in range" }
  return { ok: true, value: value }
}

function validateSurface(value, label) {
  if (value === undefined) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, error: label + " must be a plain object" }
  var fields = rejectUnknown(value, SURFACE_KEYS, label)
  if (!fields.ok) return fields
  var result = {}
  var textFields = ["icon", "label", "value"]
  for (var i = 0; i < textFields.length; i++) {
    var key = textFields[i]
    var textResult = optionalText(value[key], 256, label + "." + key)
    if (!textResult.ok) return textResult
    if (textResult.value !== undefined) result[key] = textResult.value
  }
  if (value.progress !== undefined) {
    if (!numberIsFinite(value.progress) || value.progress < 0 || value.progress > 1) return { ok: false, error: label + ".progress must be between 0 and 1" }
    result.progress = value.progress
  }
  return { ok: true, value: result }
}

function validateExpanded(value) {
  if (value === undefined) return { ok: true, value: undefined }
  if (!isPlainObject(value)) return { ok: false, error: "expanded must be a plain object" }
  var fields = rejectUnknown(value, REGION_KEYS, "expanded")
  if (!fields.ok) return fields
  var result = {}
  var keys = Object.keys(value)
  for (var i = 0; i < keys.length; i++) {
    var region = validateSurface(value[keys[i]], "expanded." + keys[i])
    if (!region.ok) return region
    result[keys[i]] = region.value
  }
  return { ok: true, value: result }
}

function validateTarget(value) {
  if (value === undefined) return { ok: true, value: { mode: "all" } }
  if (!isPlainObject(value)) return { ok: false, error: "target must be a plain object" }
  var fields = rejectUnknown(value, TARGET_KEYS, "target")
  if (!fields.ok) return fields
  if (["all", "focused", "screen"].indexOf(value.mode) === -1) return { ok: false, error: "target.mode is unsupported" }
  if (value.mode === "screen") {
    var screen = safeText(value.screen, 128, "target.screen")
    if (!screen.ok) return screen
    return { ok: true, value: { mode: value.mode, screen: value.screen } }
  }
  if (value.screen !== undefined) return { ok: false, error: "target.screen is unsupported for this mode" }
  return { ok: true, value: { mode: value.mode } }
}

function validateActions(value) {
  if (value === undefined) return { ok: true, value: [] }
  if (!Array.isArray(value) || value.length > 3) return { ok: false, error: "actions must contain at most three items" }
  var result = []
  var seen = []
  for (var i = 0; i < value.length; i++) {
    var action = value[i]
    if (!isPlainObject(action)) return { ok: false, error: "actions must contain plain objects" }
    var fields = rejectUnknown(action, ACTION_KEYS, "actions[" + i + "]")
    if (!fields.ok) return fields
    var actionId = safeText(action.id, 128, "actions[" + i + "].id")
    if (!actionId.ok) return actionId
    if (seen.indexOf(action.id) !== -1) return { ok: false, error: "actions cannot repeat an id" }
    seen.push(action.id)
    var label = safeText(action.label, 256, "actions[" + i + "].label")
    if (!label.ok) return label
    var role = action.role === undefined ? "secondary" : action.role
    if (["primary", "secondary"].indexOf(role) === -1) return { ok: false, error: "actions role is unsupported" }
    var enabled = action.enabled === undefined ? true : action.enabled
    if (typeof enabled !== "boolean") return { ok: false, error: "actions enabled must be boolean" }
    result.push({ id: action.id, label: action.label, role: role, enabled: enabled })
  }
  return { ok: true, value: result }
}

function validateActivity(raw, nowMs) {
  var basic = serializable(raw, "activity", [])
  if (!basic.ok) return basic
  if (!isPlainObject(raw)) return { ok: false, error: "activity must be a plain object" }
  var fields = rejectUnknown(raw, ACTIVITY_KEYS, "activity")
  if (!fields.ok) return fields
  var source = safeIdentity(raw.source, "activity.source")
  if (!source.ok) return source
  var id = safeIdentity(raw.id, "activity.id")
  if (!id.ok) return id
  var revisionResult = integerField(raw.revision, "activity.revision", 0, Number.MAX_SAFE_INTEGER || 9007199254740991)
  if (!revisionResult.ok) return revisionResult
  var revision = revisionResult.value
  var updatedResult = integerField(raw.updatedAt, "activity.updatedAt", 0, Number.MAX_SAFE_INTEGER || 9007199254740991)
  if (!updatedResult.ok) return updatedResult
  var updatedAt = updatedResult.value
  var createdAt = raw.createdAt === undefined ? raw.updatedAt : raw.createdAt
  var created = integerField(createdAt, "activity.createdAt", 0, Number.MAX_SAFE_INTEGER || 9007199254740991)
  if (!created.ok) return created
  if (createdAt > updatedAt) return { ok: false, error: "activity.createdAt must not be after updatedAt" }
  if (updatedAt > nowMs) return { ok: false, error: "activity.updatedAt cannot be in the future" }
  var expiresAt = raw.expiresAt === undefined ? 0 : raw.expiresAt
  if (!integer(expiresAt) || expiresAt < 0 || expiresAt > (Number.MAX_SAFE_INTEGER || 9007199254740991)) return { ok: false, error: "activity.expiresAt must be a nonnegative integer" }
  if (expiresAt !== 0 && expiresAt <= nowMs) return { ok: false, error: "activity publication has already expired" }
  var priority = raw.priority === undefined ? "normal" : raw.priority
  if (!own(PRIORITY_RANK, priority)) return { ok: false, error: "activity.priority is unsupported" }
  var relevance = raw.relevance === undefined ? 0 : raw.relevance
  if (!numberIsFinite(relevance) || relevance < 0 || relevance > 100) return { ok: false, error: "activity.relevance must be between 0 and 100" }
  var transientMs = raw.transientMs === undefined ? 0 : raw.transientMs
  var transient = integerField(transientMs, "activity.transientMs", 0, 5000)
  if (!transient.ok) return transient
  var target = validateTarget(raw.target)
  if (!target.ok) return target
  var privacy = raw.privacy === undefined ? "public" : raw.privacy
  if (["public", "sensitive"].indexOf(privacy) === -1) return { ok: false, error: "activity.privacy is unsupported" }
  var kind = raw.kind === undefined ? "activity" : raw.kind
  var kindResult = safeText(kind, 64, "activity.kind")
  if (!kindResult.ok) return kindResult
  var compact = validateSurface(raw.compact, "compact")
  if (!compact.ok) return compact
  var minimal = validateSurface(raw.minimal, "minimal")
  if (!minimal.ok) return minimal
  var expanded = validateExpanded(raw.expanded)
  if (!expanded.ok) return expanded
  var actions = validateActions(raw.actions)
  if (!actions.ok) return actions
  return {
    ok: true,
    value: {
      source: source.value,
      id: id.value,
      kind: kind,
      revision: revision,
      priority: priority,
      relevance: relevance,
      createdAt: createdAt,
      updatedAt: updatedAt,
      expiresAt: expiresAt,
      transientMs: transientMs,
      target: target.value,
      privacy: privacy,
      compact: compact.value === undefined ? null : compact.value,
      minimal: minimal.value === undefined ? null : minimal.value,
      expanded: expanded.value === undefined ? null : expanded.value,
      actions: actions.value
    }
  }
}

function identityKey(source, id) {
  return JSON.stringify([source, id])
}

function validateKey(value, label) {
  var text = safeText(value, 300, label)
  if (!text.ok) return text
  var parsed
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    return { ok: false, error: label + " must be an internal activity key" }
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return { ok: false, error: label + " must be an internal activity key" }
  var source = safeIdentity(parsed[0], label + ".source")
  var id = safeIdentity(parsed[1], label + ".id")
  if (!source.ok || !id.ok || identityKey(parsed[0], parsed[1]) !== value) return { ok: false, error: label + " must be an internal activity key" }
  return text
}

function validateCommand(raw, nowMs) {
  var basic = serializable(raw, "command", [])
  if (!basic.ok) return basic
  if (!isPlainObject(raw)) return { ok: false, error: "command must be a plain object" }
  var typeResult = safeText(raw.type, 32, "command.type")
  if (!typeResult.ok || !own(COMMAND_KEYS, raw.type)) return { ok: false, error: "command.type is unsupported" }
  var fields = rejectUnknown(raw, COMMAND_KEYS[raw.type], "command")
  if (!fields.ok) return fields
  if (raw.type === "publish" || raw.type === "update") {
    var activity = validateActivity(raw.activity, nowMs)
    if (!activity.ok) return activity
    return { ok: true, value: { type: raw.type, activity: activity.value } }
  }
  if (raw.type === "end") {
    var source = safeIdentity(raw.source, "command.source")
    if (!source.ok) return source
    var id = safeIdentity(raw.id, "command.id")
    if (!id.ok) return id
    if (raw.revision !== undefined) {
      var revision = integerField(raw.revision, "command.revision", 0, Number.MAX_SAFE_INTEGER || 9007199254740991)
      if (!revision.ok) return revision
    }
    return { ok: true, value: { type: "end", source: raw.source, id: raw.id, revision: raw.revision } }
  }
  if (raw.type === "tick") {
    if (raw.leaseToken !== undefined) {
      var lease = integerField(raw.leaseToken, "command.leaseToken", 0, Number.MAX_SAFE_INTEGER || 9007199254740991)
      if (!lease.ok) return lease
    }
    return { ok: true, value: { type: "tick", leaseToken: raw.leaseToken } }
  }
  if (raw.type === "collapse") {
    var collapseReason = raw.reason === undefined ? "user" : raw.reason
    var collapseText = safeText(collapseReason, 64, "command.reason")
    if (!collapseText.ok) return collapseText
    return { ok: true, value: { type: "collapse", reason: collapseReason } }
  }
  if (raw.type === "expand") {
    var hasSource = raw.source !== undefined
    var hasId = raw.id !== undefined
    if (hasSource !== hasId) return { ok: false, error: "expand source and id must be paired" }
    if (raw.key !== undefined && hasSource) return { ok: false, error: "expand key cannot be combined with source and id" }
    if (hasSource) {
      var expandSource = safeIdentity(raw.source, "command.source")
      if (!expandSource.ok) return expandSource
      var expandId = safeIdentity(raw.id, "command.id")
      if (!expandId.ok) return expandId
    }
    if (raw.key !== undefined) {
      var key = validateKey(raw.key, "command.key")
      if (!key.ok) return key
    }
    if (!hasSource && raw.key === undefined && raw.screen !== undefined) return { ok: false, error: "expand screen needs an activity" }
    if (raw.screen !== undefined) {
      var expandScreen = safeText(raw.screen, 128, "command.screen")
      if (!expandScreen.ok) return expandScreen
    }
    var reason = raw.reason === undefined ? "user" : raw.reason
    var expandReason = safeText(reason, 64, "command.reason")
    if (!expandReason.ok) return expandReason
    return { ok: true, value: { type: "expand", key: raw.key, source: raw.source, id: raw.id, screen: raw.screen, reason: reason } }
  }
  var actionId = safeText(raw.actionId, 128, "command.actionId")
  if (!actionId.ok) return actionId
  var hasInvokeSource = raw.source !== undefined
  var hasInvokeId = raw.id !== undefined
  if (hasInvokeSource !== hasInvokeId) return { ok: false, error: "invoke source and id must be paired" }
  if (raw.key !== undefined && hasInvokeSource) return { ok: false, error: "invoke key cannot be combined with source and id" }
  if (hasInvokeSource) {
    var invokeSource = safeIdentity(raw.source, "command.source")
    if (!invokeSource.ok) return invokeSource
    var invokeId = safeIdentity(raw.id, "command.id")
    if (!invokeId.ok) return invokeId
  }
  if (raw.key !== undefined) {
    var invokeKey = validateKey(raw.key, "command.key")
    if (!invokeKey.ok) return invokeKey
  }
  if (!hasInvokeSource && raw.key === undefined) return { ok: false, error: "invoke needs an activity" }
  return { ok: true, value: { type: "invoke", key: raw.key, source: raw.source, id: raw.id, actionId: raw.actionId } }
}

function initialState() {
  return {
    revision: 0,
    activitiesByKey: {},
    presentation: {
      phase: "idle",
      primaryKey: null,
      secondaryKey: null,
      selectedKey: null,
      underlyingKey: null,
      ownerScreen: "",
      reason: "",
      leaseToken: 0
    }
  }
}

function copyState(state) {
  var source = state && isPlainObject(state) ? state : initialState()
  var result = initialState()
  result.revision = integer(source.revision) && source.revision >= 0 ? source.revision : 0
  var sourceMap = isPlainObject(source.activitiesByKey) ? source.activitiesByKey : {}
  var keys = Object.keys(sourceMap)
  for (var i = 0; i < keys.length; i++) result.activitiesByKey[keys[i]] = clone(sourceMap[keys[i]])
  if (isPlainObject(source.presentation)) {
    var presentationKeys = Object.keys(result.presentation)
    for (var j = 0; j < presentationKeys.length; j++) {
      var presentationKey = presentationKeys[j]
      if (source.presentation[presentationKey] !== undefined) result.presentation[presentationKey] = source.presentation[presentationKey]
    }
  }
  return result
}

function eligible(activity, focusedScreen) {
  if (!activity || !activity.target) return false
  if (activity.target.mode === "all") return true
  if (activity.target.mode === "focused") return focusedScreen !== ""
  return activity.target.screen === focusedScreen
}

function compareEntries(a, b) {
  var priorityDelta = PRIORITY_RANK[b.activity.priority] - PRIORITY_RANK[a.activity.priority]
  if (priorityDelta !== 0) return priorityDelta
  var relevanceDelta = b.activity.relevance - a.activity.relevance
  if (relevanceDelta !== 0) return relevanceDelta
  var updatedDelta = b.activity.updatedAt - a.activity.updatedAt
  if (updatedDelta !== 0) return updatedDelta
  var createdDelta = b.activity.createdAt - a.activity.createdAt
  if (createdDelta !== 0) return createdDelta
  if (a.key < b.key) return -1
  if (a.key > b.key) return 1
  return 0
}

function selection(map, focusedScreen, nowMs) {
  var entries = []
  var keys = Object.keys(map)
  for (var i = 0; i < keys.length; i++) {
    var activity = map[keys[i]]
    if (!eligible(activity, focusedScreen)) continue
    if (activity.expiresAt !== 0 && activity.expiresAt <= nowMs) continue
    entries.push({ key: keys[i], activity: activity })
  }
  entries.sort(compareEntries)
  return {
    primaryKey: entries.length > 0 ? entries[0].key : null,
    secondaryKey: entries.length > 1 ? entries[1].key : null,
    entries: entries
  }
}

function activityPhase(activity) {
  if (!activity) return "idle"
  if (activity.compact !== null) return "compact"
  return activity.minimal !== null ? "minimal" : "compact"
}

function presentationFor(map, oldPresentation, focusedScreen, nowMs, reason) {
  var chosen = selection(map, focusedScreen, nowMs)
  if (!chosen.primaryKey) {
    return {
      phase: "idle",
      primaryKey: null,
      secondaryKey: null,
      selectedKey: null,
      underlyingKey: null,
      ownerScreen: "",
      reason: reason || "empty",
      leaseToken: oldPresentation.leaseToken
    }
  }
  var selected = chosen.primaryKey
  for (var i = 0; i < chosen.entries.length; i++) {
    if (chosen.entries[i].key === oldPresentation.selectedKey) {
      selected = oldPresentation.selectedKey
      break
    }
  }
  var activity = map[selected] || map[chosen.primaryKey]
  return {
    phase: activityPhase(activity),
    primaryKey: chosen.primaryKey,
    secondaryKey: chosen.secondaryKey,
    selectedKey: selected,
    underlyingKey: null,
    ownerScreen: focusedScreen || "",
    reason: reason || "selection",
    leaseToken: oldPresentation.leaseToken
  }
}

function pruneExpired(state, nowMs) {
  var keys = Object.keys(state.activitiesByKey)
  for (var i = 0; i < keys.length; i++) {
    var activity = state.activitiesByKey[keys[i]]
    if (activity.expiresAt !== 0 && activity.expiresAt <= nowMs) {
      delete state.activitiesByKey[keys[i]]
    }
  }
}

function nextWakeAt(state) {
  if (!state || !isPlainObject(state)) return null
  var wakeAt = null
  var map = isPlainObject(state.activitiesByKey) ? state.activitiesByKey : {}
  var keys = Object.keys(map)
  for (var i = 0; i < keys.length; i++) {
    var activity = map[keys[i]]
    if (!activity || !integer(activity.expiresAt) || activity.expiresAt === 0) continue
    if (wakeAt === null || activity.expiresAt < wakeAt) wakeAt = activity.expiresAt
  }
  var presentation = state.presentation
  if (isPlainObject(presentation) && presentation.phase === "alerting" && presentation.selectedKey) {
    var pulse = own(map, presentation.selectedKey) ? map[presentation.selectedKey] : null
    if (pulse && integer(pulse.updatedAt) && integer(pulse.transientMs) && pulse.transientMs > 0) {
      var leaseAt = pulse.updatedAt + pulse.transientMs
      if (numberIsFinite(leaseAt) && (wakeAt === null || leaseAt < wakeAt)) wakeAt = leaseAt
    }
  }
  return wakeAt
}

function targetKey(command, presentation) {
  if (command.key !== undefined) return command.key
  if (command.source !== undefined) return identityKey(command.source, command.id)
  return presentation.selectedKey || presentation.primaryKey
}

function finish(state, effects, accepted, error, changed) {
  return {
    accepted: accepted,
    changed: changed === true,
    error: error || "",
    state: state,
    effects: effects
  }
}

function reduce(previousState, rawCommand, context) {
  var nowMs = context && context.nowMs
  if (!integer(nowMs) || nowMs < 0) return finish(previousState, [], false, "context.nowMs must be a nonnegative integer", false)
  var commandResult = validateCommand(rawCommand, nowMs)
  if (!commandResult.ok) return finish(previousState, [], false, commandResult.error, false)
  var command = commandResult.value
  var focusedScreen = context && typeof context.focusedScreen === "string" ? context.focusedScreen : ""
  var state = copyState(previousState)
  var effects = []
  var changed = false
  var key
  var activity
  var old

  if (command.type === "publish" || command.type === "update") {
    activity = command.activity
    key = identityKey(activity.source, activity.id)
    old = state.activitiesByKey[key]
    if (command.type === "update" && !old) return finish(previousState, [], false, "cannot update an unknown activity", false)
    if (old && activity.revision <= old.revision) return finish(previousState, [], false, "activity revision is stale", false)
    if (old && activity.updatedAt < old.updatedAt) return finish(previousState, [], false, "activity update time is stale", false)
    var priorSelection = selection(state.activitiesByKey, focusedScreen, nowMs)
    state.activitiesByKey[key] = clone(activity)
    changed = true
    if (activity.transientMs > 0) {
      var token = state.presentation.leaseToken + 1
      var underlyingKey = priorSelection.primaryKey === key ? priorSelection.secondaryKey : priorSelection.primaryKey
      state.presentation = {
        phase: "alerting",
        primaryKey: key,
        secondaryKey: underlyingKey,
        selectedKey: key,
        underlyingKey: underlyingKey,
        ownerScreen: focusedScreen || "",
        reason: "pulse",
        leaseToken: token
      }
    } else {
      state.presentation = presentationFor(state.activitiesByKey, state.presentation, focusedScreen, nowMs, "publish")
    }
    state.revision += 1
    return finish(state, effects, true, "", changed)
  }

  if (command.type === "end") {
    key = identityKey(command.source, command.id)
    old = state.activitiesByKey[key]
    if (!old) return finish(previousState, [], true, "", false)
    if (command.revision !== undefined && command.revision < old.revision) return finish(previousState, [], false, "activity revision is stale", false)
    delete state.activitiesByKey[key]
    state.presentation = presentationFor(state.activitiesByKey, state.presentation, focusedScreen, nowMs, state.presentation.selectedKey === key ? "selected-ended" : "ended")
    changed = true
    state.revision += 1
    return finish(state, effects, true, "", changed)
  }

  if (command.type === "tick") {
    if (command.leaseToken !== undefined && command.leaseToken !== state.presentation.leaseToken) return finish(previousState, [], true, "", false)
    pruneExpired(state, nowMs)
    if (context && (context.anchorAvailable === false || context.anchorLost === true) && state.presentation.phase === "expanded") {
      state.presentation = presentationFor(state.activitiesByKey, state.presentation, focusedScreen, nowMs, "anchor-lost")
      changed = true
    } else if (state.presentation.phase === "alerting" && state.presentation.selectedKey) {
      var pulse = state.activitiesByKey[state.presentation.selectedKey]
      if (!pulse || pulse.transientMs === 0 || nowMs >= pulse.updatedAt + pulse.transientMs) {
        if (pulse && pulse.transientMs > 0) {
          delete state.activitiesByKey[state.presentation.selectedKey]
        }
        state.presentation = presentationFor(state.activitiesByKey, state.presentation, focusedScreen, nowMs, "pulse-restored")
        changed = true
      }
    } else {
      var next = presentationFor(state.activitiesByKey, state.presentation, focusedScreen, nowMs, "tick")
      if (JSON.stringify(next) !== JSON.stringify(state.presentation)) {
        state.presentation = next
        changed = true
      }
    }
    if (changed) state.revision += 1
    return finish(state, effects, true, "", changed)
  }

  if (command.type === "expand") {
    key = targetKey(command, state.presentation)
    activity = key ? state.activitiesByKey[key] : null
    if (!activity || !eligible(activity, focusedScreen) || (activity.expiresAt !== 0 && activity.expiresAt <= nowMs)) return finish(previousState, [], false, "cannot expand an unavailable activity", false)
    var currentSelection = selection(state.activitiesByKey, focusedScreen, nowMs)
    state.presentation = {
      phase: "expanded",
      primaryKey: currentSelection.primaryKey,
      secondaryKey: currentSelection.secondaryKey,
      selectedKey: key,
      underlyingKey: null,
      ownerScreen: command.screen || (activity.target.mode === "screen" ? activity.target.screen : focusedScreen),
      reason: command.reason,
      leaseToken: state.presentation.leaseToken
    }
    state.revision += 1
    return finish(state, [], true, "", true)
  }

  if (command.type === "collapse") {
    if (state.presentation.phase !== "expanded" && state.presentation.phase !== "alerting") return finish(previousState, [], true, "", false)
    var activePulse = state.presentation.selectedKey ? state.activitiesByKey[state.presentation.selectedKey] : null
    if (state.presentation.phase === "alerting" && activePulse && activePulse.transientMs > 0) {
      delete state.activitiesByKey[state.presentation.selectedKey]
    }
    state.presentation = presentationFor(state.activitiesByKey, state.presentation, focusedScreen, nowMs, command.reason)
    state.revision += 1
    return finish(state, effects, true, "", true)
  }

  key = targetKey(command, state.presentation)
  activity = key ? state.activitiesByKey[key] : null
  if (!activity) return finish(previousState, [], false, "cannot invoke an unavailable activity", false)
  var action = null
  for (var actionIndex = 0; actionIndex < activity.actions.length; actionIndex++) {
    if (activity.actions[actionIndex].id === command.actionId) {
      action = activity.actions[actionIndex]
      break
    }
  }
  if (!action) return finish(previousState, [], false, "action is not declared by the activity", false)
  if (!action.enabled) return finish(previousState, [], false, "action is disabled", false)
  effects.push({ type: "invoke-owner", key: key, actionId: action.id })
  return finish(state, effects, true, "", false)
}

if (typeof module !== "undefined") {
  module.exports = {
    initialState: initialState,
    identityKey: identityKey,
    validateActivity: validateActivity,
    validateCommand: validateCommand,
    nextWakeAt: nextWakeAt,
    reduce: reduce
  }
}
