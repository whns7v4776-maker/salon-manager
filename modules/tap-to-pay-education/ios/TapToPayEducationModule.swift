import ExpoModulesCore

public final class TapToPayEducationModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoTapToPayEducation")
    AsyncFunction("showHowToTap") { (promise: Promise) in
      Task { @MainActor in
        guard let root = self.appContext?.utilities?.currentViewController() else {
          promise.reject("NO_VIEW_CONTROLLER", "Apri Tap to Pay nell’app e riprova.")
          return
        }
        do { promise.resolve(try await TapToPayEducationPresenter.show(from: root)) }
        catch { promise.reject("EDUCATION_UNAVAILABLE", "La guida Tap to Pay non è disponibile. Verifica la connessione e riprova.") }
      }
    }
  }
}
