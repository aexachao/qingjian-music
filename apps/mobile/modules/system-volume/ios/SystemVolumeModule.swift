import ExpoModulesCore
import MediaPlayer
import UIKit

/// iOS 没有公开 API 能直接改系统音量，只能放一个系统的 MPVolumeView 让用户去拖。
/// 这里把它的外观收紧成跟 App 进度条一致：细线、白 thumb、去掉内置的喇叭图标。
/// 只允许用户拖动，不做代码侧的 setVolume（那要私有 API，审核会 2.5.1 被打回）。
class SystemVolumeSliderView: ExpoView {
  private let volumeView = MPVolumeView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    volumeView.showsRouteButton = false
    volumeView.showsVolumeSlider = true
    addSubview(volumeView)
    volumeView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      volumeView.leadingAnchor.constraint(equalTo: leadingAnchor),
      volumeView.trailingAnchor.constraint(equalTo: trailingAnchor),
      volumeView.centerYAnchor.constraint(equalTo: centerYAnchor),
      volumeView.heightAnchor.constraint(equalToConstant: 24),
    ])
    styleSlider()
  }

  /// MPVolumeView 内部其实是 UISlider 的子类，缩进边距和轨道的样式都从这里调
  private func styleSlider() {
    for view in volumeView.subviews {
      if let slider = view as? UISlider {
        slider.minimumTrackTintColor = .white
        slider.maximumTrackTintColor = UIColor.white.withAlphaComponent(0.25)
        slider.thumbTintColor = .white
        // 让 thumb 小一点，别像个大圆球
        slider.setThumbImage(thumbImage(), for: .normal)
      }
    }
  }

  private func thumbImage() -> UIImage {
    let size = CGSize(width: 14, height: 14)
    let renderer = UIGraphicsImageRenderer(size: size)
    return renderer.image { context in
      UIColor.white.setFill()
      context.cgContext.fillEllipse(in: CGRect(origin: .zero, size: size))
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // 音量 slider 偶尔会被系统重建，每次布局后都顺手把样式刷回来
    styleSlider()
  }
}

public class SystemVolumeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SystemVolume")

    View(SystemVolumeSliderView.self) {}
  }
}
