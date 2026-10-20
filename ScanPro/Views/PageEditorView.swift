import SwiftUI

/// Full-page preview with filters, rotate and delete.
struct PageEditorView: View {
    @EnvironmentObject var store: DocumentStore
    @Environment(\.dismiss) private var dismiss
    let docID: UUID
    let index: Int

    @State private var original: UIImage?
    @State private var current: UIImage?
    @State private var selected: ScanFilter?

    private var doc: ScanDocument? { store.documents.first { $0.id == docID } }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if let current {
                    Image(uiImage: current).resizable().scaledToFit().padding()
                } else {
                    ProgressView().frame(maxHeight: .infinity)
                }
                Divider()
                HStack {
                    Button { selected = nil; current = original } label: { chip("Original", selected == nil) }
                    ForEach(ScanFilter.allCases) { f in
                        Button { apply(f) } label: { chip(f.rawValue, selected == f) }
                    }
                }.padding(.vertical, 12)
            }
            .navigationTitle("Page \(index + 1)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Cancel") { dismiss() } }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button(role: .destructive) {
                        if let doc { store.deletePage(doc, at: index) }
                        dismiss()
                    } label: { Image(systemName: "trash") }
                    Spacer()
                    Button {
                        original = original?.rotated90()
                        if let selected { apply(selected) } else { current = original }
                    } label: { Image(systemName: "rotate.right") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        if let doc, let current { store.replacePage(doc, at: index, with: current) }
                        dismiss()
                    }.bold()
                }
            }
            .onAppear {
                if let doc, let img = store.image(doc, page: index) { original = img; current = img }
            }
        }
    }

    private func apply(_ filter: ScanFilter) {
        guard let original else { return }
        selected = filter
        current = filter.apply(to: original)
    }

    private func chip(_ title: String, _ on: Bool) -> some View {
        Text(title).font(.subheadline)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(on ? Color.accentColor : Color.gray.opacity(0.15), in: Capsule())
            .foregroundStyle(on ? .white : .primary)
    }
}
