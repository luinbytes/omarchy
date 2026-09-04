# Activity contract

The island service owns one IslandState. The state contains revision, activitiesByKey, and tagged presentation. The broker transports publish, update, end, tick, expand, collapse, and invoke commands without owning activity state or a timer.

The reducer validates primitive serializable payloads, keys activities by source and ID, orders active activities deterministically, and returns symbolic owner-action effects. The service owns expiry scheduling and executes those effects.

The I1 fixture exposes only fixed scenarios. It is a disposable-VM verification path, not the public activity IPC API.
