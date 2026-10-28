import AppKit
import AVFoundation
import CoreGraphics
import Foundation

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let outputDir = root.appendingPathComponent("marketing")
try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
let outputURL = outputDir.appendingPathComponent("salon-pro-meta-ad.mp4")
try? FileManager.default.removeItem(at: outputURL)

let width = 1080
let height = 1920
let fps: Int32 = 30
let durationSeconds = 15
let totalFrames = Int(fps) * durationSeconds

func image(_ relativePath: String) -> NSImage {
    let url = root.appendingPathComponent(relativePath)
    guard let img = NSImage(contentsOf: url) else {
        fatalError("Missing image: \(relativePath)")
    }
    return img
}

let logo = image("assets/images/salon-pro-logo-trimmed.png")
let screenshots = [
    image("app-store-screenshots/iphone-6-9/07-agenda-iphone-6-9.png"),
    image("app-store-screenshots/iphone-6-9/08-richieste-iphone-6-9.png"),
    image("app-store-screenshots/iphone-6-9/05-clienti-iphone-6-9.png"),
    image("app-store-screenshots/iphone-6-9/06-servizi-iphone-6-9.png"),
]

struct Scene {
    let start: Double
    let end: Double
    let title: String
    let subtitle: String
    let screenshotIndex: Int
}

let scenes: [Scene] = [
    Scene(start: 0.0, end: 2.4, title: "Salon Pro", subtitle: "Il gestionale per saloni che lavorano davvero.", screenshotIndex: 0),
    Scene(start: 2.4, end: 5.6, title: "Agenda sotto controllo", subtitle: "Orari, disponibilita e richieste sempre in ordine.", screenshotIndex: 0),
    Scene(start: 5.6, end: 8.8, title: "Clienti piu autonomi", subtitle: "Prenotano online e ricevono notifiche automatiche.", screenshotIndex: 1),
    Scene(start: 8.8, end: 12.0, title: "Team, servizi e cassa", subtitle: "Tutto il flusso del salone in una sola app.", screenshotIndex: 3),
    Scene(start: 12.0, end: 15.0, title: "Scarica Salon Pro", subtitle: "Per parrucchieri, barber e centri beauty.", screenshotIndex: 2),
]

func clamp(_ value: Double, _ minValue: Double = 0, _ maxValue: Double = 1) -> Double {
    min(max(value, minValue), maxValue)
}

func smooth(_ value: Double) -> Double {
    let t = clamp(value)
    return t * t * (3 - 2 * t)
}

func roundedRect(_ rect: CGRect, radius: CGFloat, fill: NSColor) {
    fill.setFill()
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius).fill()
}

func strokeRoundedRect(_ rect: CGRect, radius: CGFloat, color: NSColor, lineWidth: CGFloat) {
    color.setStroke()
    let path = NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
    path.lineWidth = lineWidth
    path.stroke()
}

func drawText(_ text: String, in rect: CGRect, size: CGFloat, weight: NSFont.Weight, color: NSColor, align: NSTextAlignment = .center, lineHeight: CGFloat? = nil) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = align
    paragraph.lineBreakMode = .byWordWrapping
    if let lineHeight {
        paragraph.minimumLineHeight = lineHeight
        paragraph.maximumLineHeight = lineHeight
    }
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: color,
        .paragraphStyle: paragraph,
    ]
    NSString(string: text).draw(in: rect, withAttributes: attrs)
}

func drawImageAspectFill(_ image: NSImage, in rect: CGRect) {
    guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
    let imageRatio = CGFloat(cg.width) / CGFloat(cg.height)
    let rectRatio = rect.width / rect.height
    var source = CGRect(x: 0, y: 0, width: cg.width, height: cg.height)
    if imageRatio > rectRatio {
        let newWidth = CGFloat(cg.height) * rectRatio
        source.origin.x = (CGFloat(cg.width) - newWidth) / 2
        source.size.width = newWidth
    } else {
        let newHeight = CGFloat(cg.width) / rectRatio
        source.origin.y = (CGFloat(cg.height) - newHeight) / 2
        source.size.height = newHeight
    }
    if let cropped = cg.cropping(to: source) {
        NSGraphicsContext.current?.cgContext.draw(cropped, in: rect)
    }
}

func drawImageAspectFit(_ image: NSImage, in rect: CGRect, alpha: CGFloat = 1) {
    guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return }
    let imageRatio = CGFloat(cg.width) / CGFloat(cg.height)
    let rectRatio = rect.width / rect.height
    let target: CGRect
    if imageRatio > rectRatio {
        let h = rect.width / imageRatio
        target = CGRect(x: rect.minX, y: rect.midY - h / 2, width: rect.width, height: h)
    } else {
        let w = rect.height * imageRatio
        target = CGRect(x: rect.midX - w / 2, y: rect.minY, width: w, height: rect.height)
    }
    NSGraphicsContext.current?.cgContext.saveGState()
    NSGraphicsContext.current?.cgContext.setAlpha(alpha)
    NSGraphicsContext.current?.cgContext.draw(cg, in: target)
    NSGraphicsContext.current?.cgContext.restoreGState()
}

func drawPhone(_ screenshot: NSImage, in rect: CGRect, progress: Double) {
    let lift = CGFloat((1 - smooth(progress)) * 90)
    let phone = rect.offsetBy(dx: 0, dy: lift)
    roundedRect(phone.insetBy(dx: -18, dy: -18), radius: 76, fill: NSColor(calibratedWhite: 1, alpha: 0.18))
    roundedRect(phone, radius: 64, fill: NSColor(calibratedRed: 0.97, green: 0.98, blue: 1.0, alpha: 1))
    strokeRoundedRect(phone, radius: 64, color: NSColor(calibratedWhite: 1, alpha: 0.95), lineWidth: 8)
    let screen = phone.insetBy(dx: 24, dy: 24)
    NSGraphicsContext.current?.cgContext.saveGState()
    NSBezierPath(roundedRect: screen, xRadius: 48, yRadius: 48).addClip()
    drawImageAspectFill(screenshot, in: screen)
    NSGraphicsContext.current?.cgContext.restoreGState()
    roundedRect(CGRect(x: phone.midX - 86, y: phone.maxY - 50, width: 172, height: 22), radius: 11, fill: NSColor(calibratedWhite: 0.05, alpha: 0.9))
}

func drawFrame(second: Double, into context: CGContext) {
    let nsContext = NSGraphicsContext(cgContext: context, flipped: false)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = nsContext

    let colors = [
        NSColor(calibratedRed: 0.03, green: 0.06, blue: 0.12, alpha: 1).cgColor,
        NSColor(calibratedRed: 0.93, green: 0.97, blue: 0.95, alpha: 1).cgColor,
    ] as CFArray
    let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors, locations: [0.0, 1.0])!
    context.drawLinearGradient(gradient, start: CGPoint(x: 160, y: height), end: CGPoint(x: width, y: 0), options: [])

    roundedRect(CGRect(x: -110, y: 1180, width: 520, height: 520), radius: 260, fill: NSColor(calibratedRed: 0.26, green: 0.88, blue: 0.55, alpha: 0.18))
    roundedRect(CGRect(x: 760, y: 240, width: 420, height: 420), radius: 210, fill: NSColor(calibratedRed: 0.12, green: 0.35, blue: 0.95, alpha: 0.12))

    let scene = scenes.last(where: { second >= $0.start }) ?? scenes[0]
    let local = clamp((second - scene.start) / (scene.end - scene.start))
    let fadeIn = smooth(local / 0.22)
    let fadeOut = smooth((1 - local) / 0.18)
    let alpha = CGFloat(min(fadeIn, fadeOut))
    context.setAlpha(alpha)

    let logoRect = CGRect(x: 320, y: 1604, width: 440, height: 220)
    if scene.start == 0 {
        drawImageAspectFit(logo, in: logoRect, alpha: alpha)
    } else {
        drawText("Salon Pro", in: CGRect(x: 80, y: 1698, width: 920, height: 70), size: 54, weight: .black, color: NSColor(calibratedRed: 0.04, green: 0.06, blue: 0.12, alpha: 1))
    }

    drawText(scene.title, in: CGRect(x: 88, y: 1475, width: 904, height: 150), size: scene.start == 0 ? 82 : 72, weight: .black, color: NSColor(calibratedRed: 0.03, green: 0.05, blue: 0.11, alpha: 1), lineHeight: scene.start == 0 ? 86 : 78)
    drawText(scene.subtitle, in: CGRect(x: 132, y: 1378, width: 816, height: 104), size: 39, weight: .bold, color: NSColor(calibratedRed: 0.08, green: 0.11, blue: 0.18, alpha: 1), lineHeight: 46)

    let phoneBase = CGRect(x: 236, y: 260, width: 608, height: 1060)
    drawPhone(screenshots[scene.screenshotIndex], in: phoneBase, progress: local)

    if scene.start >= 12 {
        roundedRect(CGRect(x: 170, y: 132, width: 740, height: 104), radius: 52, fill: NSColor(calibratedRed: 0.04, green: 0.07, blue: 0.13, alpha: 1))
        drawText("Provala ora", in: CGRect(x: 210, y: 155, width: 660, height: 54), size: 42, weight: .bold, color: .white)
    }

    context.setAlpha(1)
    NSGraphicsContext.restoreGraphicsState()
}

let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
let settings: [String: Any] = [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 8_000_000,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    ],
]
let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
input.expectsMediaDataInRealTime = false
let attributes: [String: Any] = [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
]
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
guard writer.canAdd(input) else { fatalError("Cannot add AVAssetWriter input") }
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

let queue = DispatchQueue(label: "salon-pro-ad-writer")
var frameIndex = 0
let group = DispatchGroup()
group.enter()

input.requestMediaDataWhenReady(on: queue) {
    while input.isReadyForMoreMediaData && frameIndex < totalFrames {
        var pixelBuffer: CVPixelBuffer?
        let status = CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixelBuffer)
        guard status == kCVReturnSuccess, let buffer = pixelBuffer else {
            fatalError("Could not allocate pixel buffer")
        }
        CVPixelBufferLockBaseAddress(buffer, [])
        let baseAddress = CVPixelBufferGetBaseAddress(buffer)!
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let context = CGContext(
            data: baseAddress,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: bytesPerRow,
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        )!
        context.clear(CGRect(x: 0, y: 0, width: width, height: height))
        drawFrame(second: Double(frameIndex) / Double(fps), into: context)
        CVPixelBufferUnlockBaseAddress(buffer, [])
        let time = CMTime(value: CMTimeValue(frameIndex), timescale: fps)
        adaptor.append(buffer, withPresentationTime: time)
        frameIndex += 1
    }
    if frameIndex >= totalFrames {
        input.markAsFinished()
        writer.finishWriting {
            group.leave()
        }
    }
}

group.wait()
if writer.status != .completed {
    fatalError("Video export failed: \(writer.error?.localizedDescription ?? "unknown error")")
}
print(outputURL.path)
