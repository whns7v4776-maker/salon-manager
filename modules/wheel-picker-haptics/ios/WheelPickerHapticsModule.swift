import ExpoModulesCore
import UIKit

public final class WheelPickerHapticsModule: Module {
  private var selectionGenerator: UISelectionFeedbackGenerator?
  private var pendingSelectionPulses: [DispatchWorkItem] = []

  private let selectionPulseInterval: TimeInterval = 0.014
  private let maximumSelectionPulseCount = 8

  public func definition() -> ModuleDefinition {
    Name("ExpoWheelPickerHaptics")

    Function("supportsNativeAgendaDayPicker") {
      true
    }

    Function("prepareSelection") {
      let generator = self.ensureSelectionGenerator()
      generator.prepare()
    }

    // Manteniamo la firma storica senza argomenti: i bundle JavaScript nuovi
    // restano compatibili anche con una DEV app non ancora ricompilata.
    Function("selectionChanged") {
      self.emitSelectionBurst(1)
    }

    Function("selectionChangedBurst") { (crossedItems: Int) in
      self.emitSelectionBurst(crossedItems)
    }

    Function("endSelection") {
      self.cancelPendingSelectionPulses()
      self.selectionGenerator = nil
    }

    View(AgendaDayPickerView.self) {
      ViewName("AgendaDayPicker")

      Events(
        "onSelectionChange",
        "onSelectionDeep",
        "onDayLongPress",
        "onInteractionStart",
        "onInteractionEnd"
      )

      Prop("daysJson") { (view, daysJson: String) in
        view.setDaysJson(daysJson)
      }

      Prop("selectedIndex") { (view, selectedIndex: Int) in
        view.setSelectedIndex(selectedIndex)
      }
    }
  }

  private func emitSelectionBurst(_ crossedItems: Int) {
    let pulseCount = min(max(crossedItems, 1), maximumSelectionPulseCount)

    // Ogni nuovo campione rappresenta la posizione piu recente della ruota.
    // Eliminiamo gli impulsi non ancora emessi per evitare che l'aptica resti
    // in coda e continui quando il dito si e gia fermato.
    cancelPendingSelectionPulses()
    emitSelectionPulse()

    guard pulseCount > 1 else { return }

    for pulseIndex in 1..<pulseCount {
      let workItem = DispatchWorkItem { [weak self] in
        self?.emitSelectionPulse()
      }
      pendingSelectionPulses.append(workItem)
      DispatchQueue.main.asyncAfter(
        deadline: .now() + selectionPulseInterval * Double(pulseIndex),
        execute: workItem
      )
    }
  }

  private func emitSelectionPulse() {
    let generator = ensureSelectionGenerator()
    generator.selectionChanged()
    generator.prepare()
  }

  private func cancelPendingSelectionPulses() {
    pendingSelectionPulses.forEach { $0.cancel() }
    pendingSelectionPulses.removeAll(keepingCapacity: true)
  }

  private func ensureSelectionGenerator() -> UISelectionFeedbackGenerator {
    if let generator = selectionGenerator {
      return generator
    }
    let generator = UISelectionFeedbackGenerator()
    selectionGenerator = generator
    return generator
  }
}
