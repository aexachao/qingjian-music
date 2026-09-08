import AVFoundation
import ExpoModulesCore
import MediaPlayer

class VolumeObserver: NSObject {
  var onVolumeChange: ((Float) -> Void)?

  private var observation: NSKeyValueObservation?

  override init() {
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

  public func definition() -> ModuleDefinition {
    Name("SystemVolume")

    Events("onVolumeChange")

    OnStartObserving {
      if self.observer == nil {
        self.observer = VolumeObserver()
        self.observer?.onVolumeChange = { [weak self] volume in
          self?.sendEvent("onVolumeChange", ["volume": volume])
        }
      }
    }

    OnStopObserving {
      self.observer = nil
    }

    AsyncFunction("setSystemVolume") { (volume: Double) in
      await MainActor.run {
        let volumeView = MPVolumeView()
        if let slider = volumeView.subviews.first(where: { $0 is UISlider }) as? UISlider {
          slider.value = Float(volume)
        }
      }
    }

    View(SystemVolumeSliderView.self) {}
  }
}
