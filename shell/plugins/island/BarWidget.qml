import QtQuick
import qs.Ui as Ui

Ui.BarWidget {
  id: root

  moduleName: "omarchy.island"
  readonly property bool opened: false
  property real slotWidth: 0

  visible: false
  implicitWidth: 0
  implicitHeight: root.barSize >= 0 && isFinite(root.barSize) ? root.barSize : 0

  function open(payload) {
    return false
  }

  function close() {
    return true
  }
}
