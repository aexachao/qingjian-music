import AVKit
import ExpoModulesCore

/// iOS 的输出设备（AirPlay）选择面板只能由系统的 AVRoutePickerView 弹出，
/// 没有公开 API 能用代码直接打开，所以这里包一层原生视图给 RN 用。
///
/// 视图直接可见：图标就是系统 AirPlay 自己的图形（我们 App 画的替代不了，
/// 系统面板、状态栏、控制中心认的都是它）。颜色跟 App 主题走：没连设备是
/// 白色，连上 AirPlay 设备后变 App 的强调红（跟收藏、正在播放同色）。
class AirplayRouteButtonView: ExpoView {
  private let picker = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    // 音频场景：不要优先列视频设备（否则 Apple TV 之类会排在前面）
    picker.prioritizesVideoDevices = false
    picker.tintColor = .white
    // 强调红 #f62c55
    picker.activeTintColor = UIColor(red: 246 / 255, green: 44 / 255, blue: 85 / 255, alpha: 1)
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
