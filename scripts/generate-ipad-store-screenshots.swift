import AppKit
import Foundation

let inputDir = URL(fileURLWithPath: CommandLine.arguments[1])
let outputDir = URL(fileURLWithPath: CommandLine.arguments[2])
let files = (try FileManager.default.contentsOfDirectory(at: inputDir, includingPropertiesForKeys: nil))
  .filter { $0.pathExtension.lowercased() == "jpg" || $0.pathExtension.lowercased() == "jpeg" || $0.pathExtension.lowercased() == "png" }
  .sorted { $0.lastPathComponent < $1.lastPathComponent }

let canvasSize = NSSize(width: 2048, height: 2732)
let cardSize = NSSize(width: 1180, height: 2556)
let cardOrigin = NSPoint(
  x: (canvasSize.width - cardSize.width) / 2,
  y: (canvasSize.height - cardSize.height) / 2
)

for file in files {
  guard let source = NSImage(contentsOf: file) else { continue }
  let image = NSImage(size: canvasSize)
  image.lockFocus()

  NSColor(calibratedRed: 0.953, green: 0.965, blue: 0.984, alpha: 1).setFill()
  NSRect(origin: .zero, size: canvasSize).fill()

  let cardRect = NSRect(origin: cardOrigin, size: cardSize)
  let path = NSBezierPath(roundedRect: cardRect, xRadius: 72, yRadius: 72)
  NSGraphicsContext.saveGraphicsState()
  let shadow = NSShadow()
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.16)
  shadow.shadowBlurRadius = 34
  shadow.shadowOffset = NSSize(width: 0, height: -18)
  shadow.set()
  NSColor.white.setFill()
  path.fill()
  NSGraphicsContext.restoreGraphicsState()

  let scale = min(cardSize.width / source.size.width, cardSize.height / source.size.height)
  let drawSize = NSSize(width: source.size.width * scale, height: source.size.height * scale)
  let drawOrigin = NSPoint(
    x: cardOrigin.x + (cardSize.width - drawSize.width) / 2,
    y: cardOrigin.y + (cardSize.height - drawSize.height) / 2
  )

  source.draw(in: NSRect(origin: drawOrigin, size: drawSize), from: .zero, operation: .sourceOver, fraction: 1)
  image.unlockFocus()

  guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let data = bitmap.representation(using: .jpeg, properties: [.compressionFactor: 0.95])
  else { continue }

  let name = file.deletingPathExtension().lastPathComponent
    .replacingOccurrences(of: "iphone-6-9", with: "ipad-13")
    .replacingOccurrences(of: "iphone-6-5", with: "ipad-13")
  let output = outputDir.appendingPathComponent("\(name).jpg")
  try data.write(to: output)
}
