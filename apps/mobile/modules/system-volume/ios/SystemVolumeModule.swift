import ExpoModulesCore
import MediaPlayer
import AVFoundation

class VolumeObserver: NSObject {
  var onVolumeChange: ((Float) -> Void)?
  
  override init() {
    super.init()
    do {
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {}
    AVAudioSession.sharedInstance().addObserver(
      self,
      forKeyPath: "outputVolume",
      options: [.new, .initial],
      context: nil
    )
  }
  
  deinit {
    AVAudioSession.sharedInstance().removeObserver(self, forKeyPath: "outputVolume")
  }
  
  override func observeValue(
    forKeyPath keyPath: String?,
    of object: Any?,
    change: [NSKeyValueChangeKey : Any]?,
    context: UnsafeMutableRawPointer?
  ) {
    if keyPath == "outputVolume", let volume = change?[.newKey] as? Float {
      onVolumeChange?(volume)
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
  private let sharedVolumeView = MPVolumeView() // 用于编程式设置音量

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
      DispatchQueue.main.async {
        if let slider = self.sharedVolumeView.subviews.first(where: { $0 is UISlider }) as? UISlider {
          slider.value = Float(volume)
        }
      }
    }

    View(SystemVolumeSliderView.self) {}
  }
}
