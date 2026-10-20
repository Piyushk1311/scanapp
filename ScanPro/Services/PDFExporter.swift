import UIKit
import PDFKit

enum PDFExporter {
    /// Builds a PDF (one page per image, sized to the image's aspect ratio) and returns a temp file URL.
    static func export(name: String, images: [UIImage]) -> URL? {
        let pdf = PDFDocument()
        for (i, image) in images.enumerated() {
            if let page = PDFPage(image: image) { pdf.insert(page, at: i) }
        }
        let safe = name.replacingOccurrences(of: "[/\\\\:,]", with: "-", options: .regularExpression)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safe).pdf")
        return pdf.write(to: url) ? url : nil
    }
}
