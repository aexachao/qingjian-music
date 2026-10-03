import AVFoundation
import AVKit
import ExpoModulesCore
import UIKit

/// iOS 的输出设备（AirPlay）选择面板只能由系统的 AVRoutePickerView 弹出，
/// 没有公开 API 能用代码直接打开，所以这里包一层原生视图给 RN 用。
/// AVRoutePickerView 仍然铺满并负责点击，图标层只是不可交互的 SF Symbol 覆盖层。
@MainActor
final class AirplayRouteButtonView: ExpoView, AVRoutePickerViewDelegate {
  private struct RouteDescription {
    let name: String
    let external: Bool
    let symbolName: String
  }

  private let picker = AVRoutePickerView()
  private let routeIconView = UIImageView()
  let onRouteChange = EventDispatcher()
  let onPickerVisibilityChange = EventDispatcher()

  private var routeObserver: NSObjectProtocol?
  private var iconTintColor: UIColor = .label
  private var lastEmittedRoute: (name: String, external: Bool)?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    picker.prioritizesVideoDevices = false
    picker.delegate = self
    picker.tintColor = .clear
    picker.activeTintColor = .clear
    picker.accessibilityLabel = "音频输出"
    picker.accessibilityHint = "打开音频输出设备列表"
    addSubview(picker)

    routeIconView.isUserInteractionEnabled = false
    routeIconView.isAccessibilityElement = false
    routeIconView.contentMode = .scaleAspectFit
    routeIconView.tintColor = iconTintColor
    addSubview(routeIconView)

    routeObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.routeChangeNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { [weak self] _ in
      self?.reportCurrentRoute()
    }

    updateRouteIcon()
  }

  deinit {
    if let routeObserver {
      NotificationCenter.default.removeObserver(routeObserver)
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      // The JS listener may be attached after init; report again once mounted.
      reportCurrentRoute(force: true)
    }
  }

  func didApplyProps() {
    // This runs after RN has applied tintColor and the event prop, so the first
    // route snapshot is delivered with the final icon configuration.
    updateRouteIcon()
    reportCurrentRoute()
  }

  func routePickerViewWillBeginPresentingRoutes(_ routePickerView: AVRoutePickerView) {
    onPickerVisibilityChange(["visible": true])
  }

  func routePickerViewDidEndPresentingRoutes(_ routePickerView: AVRoutePickerView) {
    onPickerVisibilityChange(["visible": false])
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
    let iconSize: CGFloat = 24
    routeIconView.frame = CGRect(
      x: bounds.midX - iconSize / 2,
      y: bounds.midY - iconSize / 2,
      width: iconSize,
      height: iconSize
    )
  }

  func setIconTintColor(_ color: UIColor?) {
    iconTintColor = color ?? .label
    routeIconView.tintColor = iconTintColor
  }

  private func reportCurrentRoute(force: Bool = false) {
    updateRouteIcon()
    let route = currentRoute()
    guard force || lastEmittedRoute?.name != route.name || lastEmittedRoute?.external != route.external else {
      return
    }
    lastEmittedRoute = (name: route.name, external: route.external)
    onRouteChange([
      "name": route.name,
      "external": route.external
    ])
  }

  private func updateRouteIcon() {
    let route = currentRoute()
    // A newer symbol name may be unavailable on an older supported iOS. Keep
    // the neutral AirPlay glyph visible in that case.
    let configuration = UIImage.SymbolConfiguration(pointSize: 24, weight: .regular)
    routeIconView.image =
      UIImage(systemName: route.symbolName, withConfiguration: configuration) ??
      UIImage(systemName: "airplayaudio", withConfiguration: configuration)
    routeIconView.tintColor = iconTintColor
  }

  private func currentRoute() -> RouteDescription {
    let outputs = AVAudioSession.sharedInstance().currentRoute.outputs
    let names = outputs
      .map(\.portName)
      .filter { !$0.isEmpty }
      .reduce(into: [String]()) { names, name in
        if !names.contains(name) {
          names.append(name)
        }
      }

    let externalOutputs = outputs.filter { output in
      switch output.portType {
      case .builtInSpeaker, .builtInReceiver:
        return false
      default:
        return true
      }
    }

    return RouteDescription(
      name: names.joined(separator: ", "),
      external: !externalOutputs.isEmpty,
      symbolName: symbolName(for: externalOutputs)
    )
  }

  private func symbolName(for externalOutputs: [AVAudioSessionPortDescription]) -> String {
    guard !externalOutputs.isEmpty else {
      return "airplayaudio"
    }

    // Prefer explicit route types over the generic Bluetooth route. Do not
    // infer a headphone model from a Bluetooth port name.
    if externalOutputs.contains(where: { $0.portType == .headphones || $0.portType == .headsetMic }) {
      return "headphones"
    }
    if externalOutputs.contains(where: { $0.portType == .carAudio }) {
      return "car"
    }
    if externalOutputs.contains(where: { $0.portType == .usbAudio }) {
      return "cable.connector.horizontal"
    }
    if externalOutputs.contains(where: { $0.portType == .airPlay }) {
      return namedExternalSymbol(for: externalOutputs) ?? "airplayaudio"
    }
    if externalOutputs.contains(where: {
      $0.portType == .bluetoothA2DP ||
      $0.portType == .bluetoothHFP ||
      $0.portType == .bluetoothLE
    }) {
      return namedExternalSymbol(for: externalOutputs) ?? "airplayaudio"
    }
    if externalOutputs.contains(where: {
      $0.portType == .HDMI || $0.portType == .displayPort
    }) {
      return "display"
    }

    // Keep a neutral, public SF Symbol for routes whose type is not covered
    // above; the system picker remains the actual interactive control.
    return "airplayaudio"
  }

  private func namedExternalSymbol(for outputs: [AVAudioSessionPortDescription]) -> String? {
    let names = outputs.map { $0.portName.lowercased() }

    if names.contains(where: {
      $0.contains("airpods") ||
      $0.contains("headphones") ||
      $0.contains("headset") ||
      $0.contains("耳机")
    }) {
      return "headphones"
    }
    if names.contains(where: { $0.contains("macbook") }) {
      return "laptopcomputer"
    }
    if names.contains(where: { $0.contains("homepod") }) {
      return "homepod"
    }
    if names.contains(where: { $0.contains("apple tv") || $0.contains("appletv") }) {
      return "appletv"
    }
    return nil
  }
}

public class AirplayButtonModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AirplayButton")

    View(AirplayRouteButtonView.self) {
      Events("onRouteChange", "onPickerVisibilityChange")
      OnViewDidUpdateProps { (view: AirplayRouteButtonView) in
        view.didApplyProps()
      }

      Prop("tintColor") { (view: AirplayRouteButtonView, color: UIColor?) in
        view.setIconTintColor(color)
      }
      Prop("activeTintColor") { (view: AirplayRouteButtonView, color: UIColor?) in
        // Kept for callers compiled against the old API. Both picker tints
        // stay transparent so active state cannot introduce a brand color.
        _ = view
        _ = color
      }
    }
  }
}
