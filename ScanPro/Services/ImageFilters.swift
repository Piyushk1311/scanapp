import UIKit
import CoreImage
import CoreImage.CIFilterBuiltins

enum ScanFilter: String, CaseIterable, Identifiable {
    case enhance = "Enhance"
    case grayscale = "Grayscale"
    case blackWhite = "B&W"

    var id: String { rawValue }

    func apply(to image: UIImage) -> UIImage {
        guard let input = CIImage(image: image) else { return image }
        let output: CIImage

        switch self {
        case .enhance:
            let f = CIFilter.colorControls()
            f.inputImage = input
            f.contrast = 1.25
            f.brightness = 0.05
            f.saturation = 1.1
            output = f.outputImage ?? input
        case .grayscale:
            let f = CIFilter.photoEffectMono()
            f.inputImage = input
            output = f.outputImage ?? input
        case .blackWhite:
            let mono = CIFilter.colorControls()
            mono.inputImage = input
            mono.saturation = 0
            mono.contrast = 2.2
            mono.brightness = 0.1
            output = mono.outputImage ?? input
        }

        let context = CIContext()
        guard let cg = context.createCGImage(output, from: output.extent) else { return image }
        return UIImage(cgImage: cg, scale: image.scale, orientation: image.imageOrientation)
    }
}

extension UIImage {
    func rotated90() -> UIImage {
        let size = CGSize(width: self.size.height, height: self.size.width)
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            ctx.cgContext.translateBy(x: size.width / 2, y: size.height / 2)
            ctx.cgContext.rotate(by: .pi / 2)
            draw(in: CGRect(x: -self.size.width / 2, y: -self.size.height / 2,
                            width: self.size.width, height: self.size.height))
        }
    }
}
