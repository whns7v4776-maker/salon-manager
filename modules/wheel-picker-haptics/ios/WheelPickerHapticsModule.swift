import ExpoModulesCore
import UIKit

public final class WheelPickerHapticsModule: Module {
  private var selectionGenerator: UISelectionFeedbackGenerator?

  public func definition() -> ModuleDefinition {
    Name("ExpoWheelPickerHaptics")

    Function("prepareSelection") {
      let generator = self.ensureSelectionGenerator()
      generator.prepare()
    }

    Function("selectionChanged") {
      let generator = self.ensureSelectionGenerator()
      generator.selectionChanged()
      generator.prepare()
    }

    Function("endSelection") {
      self.selectionGenerator = nil
    }
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
