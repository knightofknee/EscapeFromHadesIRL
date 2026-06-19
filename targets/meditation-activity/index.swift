import SwiftUI
import WidgetKit

// Entry point for the widget extension. The bundle contains only the
// meditation Live Activity (no home-screen widget). Deployment target is 16.4,
// so no @available guard is needed for ActivityKit/WidgetKit APIs.
@main
struct MeditationActivityBundle: WidgetBundle {
  var body: some Widget {
    MeditationLiveActivity()
  }
}
