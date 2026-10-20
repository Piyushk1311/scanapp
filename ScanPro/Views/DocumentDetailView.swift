import SwiftUI
import VisionKit

struct DocumentDetailView: View {
    @EnvironmentObject var store: DocumentStore
    let docID: UUID

    @State private var showScanner = false
    @State private var shareItems: [Any]?
    @State private var editingPage: Int?
    @State private var showText = false
    @State private var working = false
    @State private var renaming = false
    @State private var newName = ""

    private var doc: ScanDocument? { store.documents.first { $0.id == docID } }

    var body: some View {
        Group {
            if let doc {
                ScrollView {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                        ForEach(Array(doc.pages.enumerated()), id: \.element) { index, _ in
                            thumbnail(doc, index)
                        }
                    }.padding()
                }
                .navigationTitle(doc.name)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Menu {
                            Button("Rename", systemImage: "pencil") { newName = doc.name; renaming = true }
                            Button("Add pages", systemImage: "plus.viewfinder") { showScanner = true }
                            Button("Extract text (OCR)", systemImage: "text.viewfinder") { runOCR(doc) }
                            Button("Share as images", systemImage: "photo.on.rectangle") { shareImages(doc) }
                        } label: { Image(systemName: "ellipsis.circle") }
                        Button { sharePDF(doc) } label: { Image(systemName: "square.and.arrow.up") }
                    }
                }
                .overlay { if working { ProgressView().controlSize(.large).padding(24).background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)) } }
                .alert("Rename", isPresented: $renaming) {
                    TextField("Name", text: $newName)
                    Button("Save") { store.update(doc) { $0.name = newName } }
                    Button("Cancel", role: .cancel) {}
                }
                .fullScreenCover(isPresented: $showScanner) {
                    ScannerView(
                        onFinish: { images in showScanner = false; store.append(images: images, to: doc) },
                        onCancel: { showScanner = false }
                    ).ignoresSafeArea()
                }
                .sheet(isPresented: Binding(get: { shareItems != nil }, set: { if !$0 { shareItems = nil } })) {
                    ShareSheet(items: shareItems ?? [])
                }
                .sheet(item: Binding(get: { editingPage.map { PageRef(index: $0) } }, set: { editingPage = $0?.index })) { ref in
                    PageEditorView(docID: docID, index: ref.index)
                }
                .sheet(isPresented: $showText) {
                    TextResultView(text: doc.ocrText ?? "")
                }
            } else {
                Text("Document not found")
            }
        }
    }

    private struct PageRef: Identifiable { let index: Int; var id: Int { index } }

    private func thumbnail(_ doc: ScanDocument, _ index: Int) -> some View {
        Button { editingPage = index } label: {
            VStack(spacing: 4) {
                if let img = store.image(doc, page: index) {
                    Image(uiImage: img).resizable().scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))
                }
                Text("\(index + 1)").font(.caption).foregroundStyle(.secondary)
            }
        }.buttonStyle(.plain)
    }

    private func sharePDF(_ doc: ScanDocument) {
        let images = doc.pages.indices.compactMap { store.image(doc, page: $0) }
        if let url = PDFExporter.export(name: doc.name, images: images) { shareItems = [url] }
    }

    private func shareImages(_ doc: ScanDocument) {
        shareItems = doc.pages.indices.compactMap { store.image(doc, page: $0) }
    }

    private func runOCR(_ doc: ScanDocument) {
        if doc.ocrText != nil { showText = true; return }
        working = true
        let images = doc.pages.indices.compactMap { store.image(doc, page: $0) }
        Task {
            let text = await OCRService.recognizeText(in: images)
            store.update(doc) { $0.ocrText = text }
            working = false
            showText = true
        }
    }
}

struct TextResultView: View {
    let text: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(text.isEmpty ? "No text found." : text)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
            }
            .navigationTitle("Scanned Text")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { UIPasteboard.general.string = text } label: { Image(systemName: "doc.on.doc") }
                }
            }
        }
    }
}
