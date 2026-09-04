---
name: omarchy-island-verification
description: Verify the Omarchy Island I1 reducer, shell injection, and fixture in an Omarchy checkout and disposable VM.
---

# Verify Omarchy Island

## Keep the proof layers separate

Run the offline checks before VM work.

    bash test/shell.d/island-model-test.sh
    bash test/shell.d/island-integration-test.sh
    qmllint -I shell shell/services/ActivityBroker.qml shell/plugins/island/Service.qml shell/plugins/island/BarWidget.qml shell/plugins/island/IslandFixture.qml
    ./test/shell

These checks validate the reducer, manifest, broker injection, load guards, and QML syntax. They do not prove Quickshell startup.

Run QML entry point checks only when a compositor is reachable. The existing tests skip that runtime portion when no compositor answers.

    bash test/shell.d/manifest-entrypoints-test.sh
    bash test/shell.d/bar-widget-contract-test.sh

Do not start a second Quickshell process. Do not use the active desktop as a verification target.

## Run the disposable VM

Use clean `omacom/omarchy-iso` and `omacom/omarchy-pkgs` checkouts. Build a fresh ISO from the exact Omarchy checkout that contains the candidate change. `--sync-all` alone copies the source and tests into the guest, but the acceptance suite still drives the installed `/usr/share/omarchy` tree.

    OMARCHY_CHECKOUT=/absolute/path/to/omarchy
    OMARCHY_ISO_CHECKOUT=/absolute/path/to/omarchy-iso
    OMARCHY_PKGS_CHECKOUT=/absolute/path/to/omarchy-pkgs
    cd "$OMARCHY_ISO_CHECKOUT"
    ./bin/omarchy-iso-make --no-boot-offer --local-source "$OMARCHY_CHECKOUT" "$OMARCHY_PKGS_CHECKOUT"
    ISO_PATH=$(ls -t release/*.iso | head -1)
    ./bin/omarchy-iso-test "$ISO_PATH" --sync-all "$OMARCHY_CHECKOUT" --no-preview

The harness installs the candidate shell from the ISO, waits for the guest `omarchy-shell` readiness signal, syncs the candidate tests, runs `./test/shell`, then runs the acceptance suite. Do not run `quickshell` directly in the guest or on the host.

## Drive fixed fixture scenarios

`test/acceptance.d/island-test.sh` drives the fixed I1 fixture target inside the guest. The fixture accepts no activity payload or command arguments. The acceptance test runs these commands:

    omarchy-shell omarchy-island-fixture ping
    omarchy-shell omarchy-island-fixture reset
    omarchy-shell omarchy-island-fixture compact
    omarchy-shell omarchy-island-fixture minimal
    omarchy-shell omarchy-island-fixture two
    omarchy-shell omarchy-island-fixture alerting
    omarchy-shell omarchy-island-fixture expanded
    omarchy-shell omarchy-island-fixture expiry
    omarchy-shell omarchy-island-fixture malformed

Valid scenarios print `ISLAND_FIXTURE_PASS state=<state> revision=<n>`. The malformed scenario prints `ISLAND_FIXTURE_REJECT reason=<reason>`. The test also rescans plugins and checks that the service state and fixture IPC survive. The harness saves the command output, guest shell log, and screenshot under its timestamped `test-runs/` directory.

## Capture and inspect visual evidence

For I1, inspect `success-island-i1-shell-startup.png`. Confirm that the desktop started, the inert widget reserved no space, and the default bar did not change. Inspect the fixture outputs and guest shell log for duplicate IPC targets, QML errors, rejected payloads, and stale state.

This I1 widget is inert. Do not record a transition video. Visual proof of the renderer belongs to I2.

Read the [activity contract](features/activity-contract.md) for the state owner, command set, and fixed-fixture boundary.

## Clean up the run

The harness stops its VM after the suite. If the harness is interrupted, run `./bin/omarchy-iso-test-stop` from the same `omarchy-iso` checkout. Do not kill processes by name. Preserve the timestamped `test-runs/` directory, then confirm that the harness PID file is gone and its forwarded SSH port no longer listens.
