import ActivityKit
import Foundation

// EXACT COPY of targets/meditation-activity/MeditationAttributes.swift.
// The widget extension and this app-side module are separate compile targets
// with no shared source, so the contract must be duplicated. Keep the two
// copies byte-for-byte identical or Activity.request will type-mismatch the
// widget.
struct MeditationAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var habitName: String
    var startDate: Date
    var endDate: Date
  }
}
