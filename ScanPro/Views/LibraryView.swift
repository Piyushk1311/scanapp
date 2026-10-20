import SwiftUI
import VisionKit

struct LibraryView: View {
    @EnvironmentObject var store: DocumentStore
    @State private var showScanner = false
    @State private var search = ""
    @State private var openDoc: ScanDocument?

    private var results: [ScanDocument] {
        guard !search.isEmpty else { return store.documents }
        return store.documents.filter {
            $0.name.localizedCaseInsensitiveContains(search) ||
            ($0.ocrText?.localizedCaseInsensitiveContains(search) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.documents.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "doc.viewfinder").font(.system(size: 64)).foregroundStyle(.secondary)
                        Text("No scans yet").font(.title3.bold())
                        Text("Tap the camera button to scan your first document.")
                            .foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }.padding()
                } else {
                    List {
                        ForEach(results) { doc in
                            NavigationLink(value: doc.id) { row(doc) }
                        }
                        .onDelete { offsets in offsets.map { results[$0] }.forEach(store.delete) }
                    }
                    .listStyle(.plain)
                    .searchable(text: $search, prompt: "Search names and scanned text")
                }
            }
            .navigationTitle("ScanPro")
            .navigationDestination(for: UUID.self) { id in
                if let doc = store.documents.first(where: { $0.id == id }) {
                    DocumentDetailView(docID: doc.id)
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { EditButton() }
            }
            .safeAreaInset(edge: .bottom) {
                Button {
                    showScanner = true
                } label: {
                    Label("Scan", systemImage: "camera.fill")
                        .font(.headline)
                        .padding(.horizontal, 28).padding(.vertical, 14)
                        .background(Color.accentColor, in: Capsule())
                        .foregroundStyle(.white)
                        .shadow(radius: 4, y: 2)
                }
                .padding(.bottom, 8)
            }
            .fullScreenCover(isPresented: $showScanner) {
                if VNDocumentCameraViewController.isSupported {
                    ScannerView(
                        onFinish: { images in
                            showScanner = false
                            if !images.isEmpty { store.create(images: images) }
                        },
                        onCancel: { showScanner = false }
                    ).ignoresSafeArea()
                } else {
                    Text("Document scanning isn't supported on this device (use a real iPhone/iPad, not the simulator).")
                        .padding()
                    Button("Close") { showScanner = false }
                }
            }
        }
    }

    private func row(_ doc: ScanDocument) -> some View {
        HStack(spacing: 12) {
            Group {
                if let img = store.image(doc, page: 0) {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    Color.gray.opacity(0.2)
                }
            }
            .frame(width: 56, height: 72)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(.quaternary))

            VStack(alignment: .leading, spacing: 4) {
                Text(doc.name).font(.headline).lineLimit(1)
                Text("\(doc.pages.count) page\(doc.pages.count == 1 ? "" : "s")")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
        }
    }
}
