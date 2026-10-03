import Foundation

// Keep the throwing worker alive until the independent reader finishes, so the
// reader cannot accidentally reuse the same recursive-lock-owning thread.
func check(_ label: String, _ fail: @escaping (QueueManager<Int>) throws -> Void) {
    let queue = QueueManager<Int>()
    let attempted = DispatchSemaphore(value: 0)
    let releaseWorker = DispatchSemaphore(value: 0)
    let readFinished = DispatchSemaphore(value: 0)
    DispatchQueue.global().async {
        do {
            try fail(queue)
            print("FAIL: expected validation error: \(label)")
            exit(1)
        } catch {}
        attempted.signal()
        releaseWorker.wait()
    }
    guard attempted.wait(timeout: .now() + 2) == .success else { exit(2) }
    DispatchQueue.global().async {
        queue.clearQueue()
        queue.add(42)
        do { _ = try queue.jump(to: 0) } catch { exit(3) }
        guard queue.current == 42 else { exit(4) }
        readFinished.signal()
    }
    let result = readFinished.wait(timeout: .now() + 2)
    releaseWorker.signal()
    guard result == .success else {
        print("FAIL: queue locked after \(label)")
        exit(5)
    }
    print("PASS: queue usable on another thread after \(label)")
}
check("empty jump") { _ = try $0.jump(to: 0) }
check("invalid insert") { try $0.add([1], at: -1) }
check("invalid remove") { $0.add(1); _ = try $0.removeItem(at: 9) }
check("invalid move") { $0.add(1); try $0.moveItem(fromIndex: 9, toIndex: 0) }
