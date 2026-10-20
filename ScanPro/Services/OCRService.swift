import UIKit
import Vision

enum OCRService {
    /// Runs on-device text recognition over every page and joins the results.
    static func recognizeText(in images: [UIImage]) async -> String {
        await Task.detached(priority: .userInitiated) {
            var pages: [String] = []
            for image in images {
                guard let cg = image.cgImage else { continue }
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = true
                let handler = VNImageRequestHandler(cgImage: cg,
                                                    orientation: CGImagePropertyOrientation(image.imageOrientation))
                try? handler.perform([request])
                let lines = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
                pages.append(lines.joined(separator: "\n"))
            }
            return pages.joined(separator: "\n\n")
        }.value
    }
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .upMirrored: self = .upMirrored
        case .down: self = .down
        case .downMirrored: self = .downMirrored
        case .left: self = .left
        case .leftMirrored: self = .leftMirrored
        case .right: self = .right
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}
