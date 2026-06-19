import ActivityKit
import Foundation

// Shared Live Activity contract. The countdown is rendered from startDate...endDate
// via SwiftUI Text(timerInterval:), which ticks on-device with NO push updates.
//
// IMPORTANT: this struct is duplicated in
// modules/meditation-activity/ios/MeditationActivityModule.swift because a
// widget extension and the app/module are separate compile targets with no
// shared source. The ContentState DECLARATION (field names + types + Codable/Hashable
// conformance) MUST stay identical across both copies, or Activity.request from
// the app won't match the widget's expected type. Comments/formatting may
// differ — only the declaration matters.
struct MeditationAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var habitName: String
    var startDate: Date
    var endDate: Date
  }
}
