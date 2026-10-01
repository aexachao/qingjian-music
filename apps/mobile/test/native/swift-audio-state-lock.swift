// Prepended by the runner with the actual dependency state accessor under test.
final class Delegate: AVPlayerWrapperDelegate {
    var onChange: ((AVPlayerWrapperState) -> Void)?
    func AVWrapper(didChangeState state: AVPlayerWrapperState) { onChange?(state) }
}

let wrapper = AVPlayerWrapper()
let delegate = Delegate()
wrapper.delegate = delegate
let queueLock = NSRecursiveLock()
let callbackEntered = DispatchSemaphore(value: 0)

delegate.onChange = { state in
    callbackEntered.signal()
    queueLock.lock()
    // A real state delegate reads both the current queue item and wrapper state.
    precondition(state == .ready && wrapper.state == .ready)
    queueLock.unlock()
    print("PASS: state delegate and queue mutation complete without lock inversion")
    exit(0)
}
DispatchQueue.global().async {
    queueLock.lock()
    wrapper.state = .ready
    guard callbackEntered.wait(timeout: .now() + 2) == .success else { exit(3) }
    precondition(wrapper.state == .ready)
    queueLock.unlock()
}
DispatchQueue.global().asyncAfter(deadline: .now() + 3) {
    print("FAIL: stateQueue / QueueManager lock inversion reproduced")
    exit(2)
}
dispatchMain()
