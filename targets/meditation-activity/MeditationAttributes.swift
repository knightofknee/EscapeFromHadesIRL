import ActivityKit
import Foundation

// Shared Live Activity contract. The countdown is rendered from startDate...endDate
// via SwiftUI Text(timerInterval:), which ticks on-device with NO push updates.
//
// IMPORTANT: this struct is duplicated at
// modules/meditation-activity/ios/MeditationAttributes.swift because a widget
// extension and the app/module are separate compile targets with no shared
// source. The two copies MUST stay byte-for-byte identical, or Activity.request
// from the app won't match the widget's expected type.
struct MeditationAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var habitName: String
    var startDate: Date
    var endDate: Date
  }
}
