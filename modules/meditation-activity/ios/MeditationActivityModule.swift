import ActivityKit
import ExpoModulesCore
import Foundation

// The Live Activity contract lives in THIS file (not a separate one) so the pod
// always compiles the struct alongside the module that uses it — a separate
// file can be dropped by a stale/incremental pod install. This ContentState
// DECLARATION (field names + types + Codable/Hashable conformance) MUST stay
// identical to the widget extension's copy at
// targets/meditation-activity/MeditationAttributes.swift (the app/module target
// and the widget target don't share source). Comments/formatting may differ.
struct MeditationAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var habitName: String
    var startDate: Date
    var endDate: Date
  }
}

// App-side bridge to ActivityKit. The widget extension only RENDERS the Live
// Activity; requesting/ending one must happen in the app process, which is what
// this module exposes to JS. Deployment target is 16.4, so no @available guard
// is needed. Every entry point degrades softly (returns nil / no-ops) so the
// timer keeps working when Live Activities are disabled.
public class MeditationActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MeditationActivityModule")

    AsyncFunction("startActivity") { (habitName: String, startMs: Double, endMs: Double) -> String? in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      let state = MeditationAttributes.ContentState(
        habitName: habitName,
        startDate: Date(timeIntervalSince1970: startMs / 1000),
        endDate: Date(timeIntervalSince1970: endMs / 1000)
      )
      // staleDate = endDate: iOS dims/auto-reaps the activity after the timer
      // ends, covering the rare case where the app is killed and can't end it.
      let content = ActivityContent(
        state: state,
        staleDate: Date(timeIntervalSince1970: endMs / 1000)
      )
      do {
        let activity = try Activity<MeditationAttributes>.request(
          attributes: MeditationAttributes(),
          content: content,
          pushType: nil
        )
        return activity.id
      } catch {
        return nil
      }
    }

    AsyncFunction("endActivity") { (id: String) in
      for activity in Activity<MeditationAttributes>.activities where activity.id == id {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }
}
