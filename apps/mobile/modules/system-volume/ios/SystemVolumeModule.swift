import AVFoundation
import ExpoModulesCore
import MediaPlayer

class VolumeObserver: NSObject {
  var onVolumeChange: ((Float) -> Void)?

  private var observation: NSKeyValueObservation?

  init(onVolumeChange: @escaping (Float) -> Void) {
    self.onVolumeChange = onVolumeChange
    super.init()
    _ = try? AVAudioSession.sharedInstance().setActive(true)
    observation = AVAudioSession.sharedInstance().observe(
      \.outputVolume,
      options: [.new, .initial]
    ) { [weak self] _, change in
      guard let volume = change.newValue else { return }
      self?.onVolumeChange?(volume)
    }
  }
}

class SystemVolumeSliderView: ExpoView {
  private let volumeView = MPVolumeView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    volumeView.showsVolumeSlider = true
    addSubview(volumeView)

    // 彻底将原生滑块移出屏幕，仅保留其在视图层级中以抑制系统音量 HUD
    volumeView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      volumeView.leadingAnchor.constraint(equalTo: leadingAnchor, constant: -9999),
      volumeView.topAnchor.constraint(equalTo: topAnchor, constant: -9999),
      volumeView.widthAnchor.constraint(equalToConstant: 100),
      volumeView.heightAnchor.constraint(equalToConstant: 20)
    ])
  }
}

public class SystemVolumeModule: Module {
  private var observer: VolumeObserver?
  /**
   * 编程式设音量用的复用视图。MPVolumeView 创建后需要一点时间才能真正写入
   * 系统音量，每次新建立刻写会被忽略；所以这里只保存一份、在主线程懒创建。
   */
  private var sharedVolumeView: MPVolumeView?

  public func definition() -> ModuleDefinition {
    Name("SystemVolume")

    Events("onVolumeChange")

    OnStartObserving {
      if self.observer == nil {
        self.observer = VolumeObserver { [weak self] volume in
          self?.sendEvent("onVolumeChange", ["volume": volume])
        }
      }
    }

    OnStopObserving {
      self.observer = nil
    }

    Function("getSystemVolume") { () -> Float in
      _ = try? AVAudioSession.sharedInstance().setActive(true)
      return AVAudioSession.sharedInstance().outputVolume
    }

    AsyncFunction("setSystemVolume") { (volume: Double) in
      await MainActor.run {
        // 视图只在主线程懒建一次并复用：MPVolumeView 需要一点时间初始化，
        // 若每次设音量都新建，写入会全部落空。
        if self.sharedVolumeView == nil {
          let view = MPVolumeView()
          view.showsVolumeSlider = true
          self.sharedVolumeView = view
        }
        if let slider = self.sharedVolumeView?.subviews.first(where: { $0 is UISlider }) as? UISlider {
          slider.value = Float(volume)
        }
      }
    }

    View(SystemVolumeSliderView.self) {}
  }
}
