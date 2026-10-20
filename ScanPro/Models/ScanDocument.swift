import Foundation

struct ScanDocument: Identifiable, Codable, Equatable {
    var id = UUID()
    var name: String
    var created = Date()
    /// File names of page images inside the document's folder, in order.
    var pages: [String]
    var ocrText: String?
}
