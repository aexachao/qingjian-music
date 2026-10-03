import Foundation
import AVFoundation

final class Listener: AVPlayerItemNotificationObserverDelegate {
    var ended = 0
    func itemDidPlayToEndTime() {
        precondition(Thread.isMainThread, "Auto-advance must share RNTP's main queue")
        ended += 1
    }
    func itemFailedToPlayToEndTime() {}
    func itemPlaybackStalled() {}
}
let observer = AVPlayerItemNotificationObserver()
let listener = Listener()
observer.delegate = listener
let oldItem = AVPlayerItem(url: URL(fileURLWithPath: "/tmp/old-audio"))
let newItem = AVPlayerItem(url: URL(fileURLWithPath: "/tmp/new-audio"))
observer.startObserving(item: oldItem)
func postFromWorker(_ item: AVPlayerItem) {
    let delivered = DispatchSemaphore(value: 0)
    DispatchQueue.global().async {
        NotificationCenter.default.post(name: .AVPlayerItemDidPlayToEndTime, object: item)
        delivered.signal()
    }
    precondition(delivered.wait(timeout: .now() + 2) == .success)
}
postFromWorker(oldItem)
// Simulate a user skip before the queued native end event reaches the main loop.
observer.startObserving(item: newItem)
RunLoop.main.run(until: Date().addingTimeInterval(0.1))
precondition(listener.ended == 0, "Stale completion must not skip the newly selected song")
postFromWorker(newItem)
RunLoop.main.run(until: Date().addingTimeInterval(0.1))
precondition(listener.ended == 1, "Current completion must advance exactly once on main")
NotificationCenter.default.post(name: .AVPlayerItemDidPlayToEndTime, object: newItem)
precondition(listener.ended == 2, "Main-thread completion should remain synchronous")
print("PASS: background auto-advance serialized, stale completion rejected, main completion preserved")
