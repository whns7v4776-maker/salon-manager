import UIKit
import ProximityReader

enum TapToPayEducationPresenter {
  @MainActor
  static func show(from root: UIViewController) async throws -> Bool {
    guard #available(iOS 18.0, *) else { return false }
    let discovery = ProximityReaderDiscovery()
    let content = try await discovery.content(for: .payment(.howToTap))
    var top = root
    while let presented = top.presentedViewController { top = presented }
    // Await dismissal before the JavaScript payment flow can continue.
    try await discovery.presentContent(content, from: top)
    return true
  }
}
