import ActivityKit
import SwiftUI
import WidgetKit

// Lock-screen + Dynamic Island UI for the meditation timer Live Activity.
// Text(timerInterval:countsDown:) and ProgressView(timerInterval:) are the two
// SwiftUI primitives iOS interpolates frame-by-frame on its own, so the
// countdown ticks live with no app running and no push. The activity is ended
// (from the app) on completion/pause/reset, so the view never needs a "done"
// state — it freezes at 00:00 only in the brief window before the end call.
struct MeditationLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: MeditationAttributes.self) { context in
      VStack(alignment: .leading, spacing: 6) {
        Text(context.state.habitName)
          .font(.headline)
          .lineLimit(1)
        Text(
          timerInterval: context.state.startDate...context.state.endDate,
          countsDown: true,
          showsHours: false
        )
        .font(.system(size: 44, weight: .bold, design: .rounded))
        .monospacedDigit()
        ProgressView(
          timerInterval: context.state.startDate...context.state.endDate,
          countsDown: true
        ) {
          EmptyView()
        } currentValueLabel: {
          EmptyView()
        }
      }
      .padding()
      .activityBackgroundTint(Color.black.opacity(0.25))
      .activitySystemActionForegroundColor(Color.white)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label(context.state.habitName, systemImage: "timer")
            .lineLimit(1)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(
            timerInterval: context.state.startDate...context.state.endDate,
            countsDown: true,
            showsHours: false
          )
          .monospacedDigit()
          .multilineTextAlignment(.trailing)
          .frame(maxWidth: 64)
        }
      } compactLeading: {
        Image(systemName: "timer")
      } compactTrailing: {
        Text(
          timerInterval: context.state.startDate...context.state.endDate,
          countsDown: true,
          showsHours: false
        )
        .monospacedDigit()
        .frame(maxWidth: 44)
      } minimal: {
        Image(systemName: "timer")
      }
      .keylineTint(Color.accentColor)
    }
  }
}
