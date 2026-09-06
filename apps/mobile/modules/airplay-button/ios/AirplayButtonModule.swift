import AVKit
import ExpoModulesCore

/// iOS 的输出设备（AirPlay）选择面板只能由系统的 AVRoutePickerView 弹出，
/// 没有公开 API 能用代码直接打开，所以这里包一层原生视图给 RN 用。
///
/// 播放页把它铺在自己的图标上面（透明度接近 0，但仍能接收点击），
/// 这样图标还是 App 自己那一套 Material 面性图标，点下去弹的是系统面板。
class AirplayRouteButtonView: ExpoView {
  private let picker = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // 音频场景：不要优先列视频设备（否则 Apple TV 之类会排在前面）
    picker.prioritizesVideoDevices = false
    picker.tintColor = .white
    picker.activeTintColor = .white
    addSubview(picker)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}

public class AirplayButtonModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AirplayButton")

    View(AirplayRouteButtonView.self) {}
  }
}
