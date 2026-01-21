;(function () {
  try {
    var globals = window.GLOBALS || []
    var ik = ""
    if (Array.isArray(globals)) {
      for (var i = 0; i < globals.length; i += 1) {
        var value = globals[i]
        if (typeof value === "string" && /^[a-z0-9]{8,12}$/i.test(value)) {
          ik = value
          break
        }
      }
    }
    window.postMessage({ type: "vamisec-ik", ik: ik }, "*")
  } catch (e) {
    window.postMessage({ type: "vamisec-ik", ik: "" }, "*")
  }
})()
