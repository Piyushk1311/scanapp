import SwiftUI

@main
struct ScanProApp: App {
    @StateObject private var store = DocumentStore()

    var body: some Scene {
        WindowGroup {
            LibraryView()
                .environmentObject(store)
        }
    }
}
