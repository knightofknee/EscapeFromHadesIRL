import ActivityKit
import Foundation

// Duplicate of targets/meditation-activity/MeditationAttributes.swift.
// The widget extension and this app-side module are separate compile targets
// with no shared source, so the contract must be duplicated. The ContentState
// DECLARATION (field names + types + Codable/Hashable conformance) MUST stay
// identical across both copies or Activity.request will type-mismatch the
// widget. Comments/formatting may differ — only the declaration matters.
struct MeditationAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var habitName: String
    var startDate: Date
    var endDate: Date
  }
}
