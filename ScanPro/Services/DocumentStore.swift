import UIKit

/// File-backed store: Documents/Scans/<uuid>/{meta.json, <page>.jpg}
@MainActor
final class DocumentStore: ObservableObject {
    @Published private(set) var documents: [ScanDocument] = []

    private let root: URL = {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Scans", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    init() { load() }

    // MARK: Paths

    private func folder(_ doc: ScanDocument) -> URL {
        root.appendingPathComponent(doc.id.uuidString, isDirectory: true)
    }

    func pageURL(_ doc: ScanDocument, _ file: String) -> URL {
        folder(doc).appendingPathComponent(file)
    }

    func image(_ doc: ScanDocument, page: Int) -> UIImage? {
        guard doc.pages.indices.contains(page) else { return nil }
        return UIImage(contentsOfFile: pageURL(doc, doc.pages[page]).path)
    }

    // MARK: CRUD

    @discardableResult
    func create(images: [UIImage]) -> ScanDocument {
        let fmt = DateFormatter()
        fmt.dateFormat = "d MMM yyyy, HH:mm"
        var doc = ScanDocument(name: "Scan \(fmt.string(from: Date()))", pages: [])
        try? FileManager.default.createDirectory(at: folder(doc), withIntermediateDirectories: true)
        doc.pages = write(images, to: doc)
        documents.insert(doc, at: 0)
        save(doc)
        return doc
    }

    func append(images: [UIImage], to doc: ScanDocument) {
        update(doc) { $0.pages += write(images, to: $0) }
    }

    func update(_ doc: ScanDocument, _ change: (inout ScanDocument) -> Void) {
        guard let i = documents.firstIndex(where: { $0.id == doc.id }) else { return }
        change(&documents[i])
        save(documents[i])
    }

    func replacePage(_ doc: ScanDocument, at index: Int, with image: UIImage) {
        guard doc.pages.indices.contains(index),
              let data = image.jpegData(compressionQuality: 0.85) else { return }
        try? data.write(to: pageURL(doc, doc.pages[index]), options: .atomic)
        update(doc) { $0.ocrText = nil }
        objectWillChange.send()
    }

    func deletePage(_ doc: ScanDocument, at index: Int) {
        guard doc.pages.indices.contains(index) else { return }
        try? FileManager.default.removeItem(at: pageURL(doc, doc.pages[index]))
        update(doc) { $0.pages.remove(at: index); $0.ocrText = nil }
    }

    func delete(_ doc: ScanDocument) {
        try? FileManager.default.removeItem(at: folder(doc))
        documents.removeAll { $0.id == doc.id }
    }

    // MARK: Persistence

    private func write(_ images: [UIImage], to doc: ScanDocument) -> [String] {
        images.compactMap { img in
            let name = UUID().uuidString + ".jpg"
            guard let data = img.jpegData(compressionQuality: 0.85) else { return nil }
            do { try data.write(to: pageURL(doc, name), options: .atomic) } catch { return nil }
            return name
        }
    }

    private func save(_ doc: ScanDocument) {
        guard let data = try? JSONEncoder().encode(doc) else { return }
        try? data.write(to: folder(doc).appendingPathComponent("meta.json"), options: .atomic)
    }

    private func load() {
        let dirs = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        documents = dirs.compactMap { dir in
            guard let data = try? Data(contentsOf: dir.appendingPathComponent("meta.json")) else { return nil }
            return try? JSONDecoder().decode(ScanDocument.self, from: data)
        }.sorted { $0.created > $1.created }
    }
}
