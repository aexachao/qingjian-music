import Foundation

typealias RCTPromiseResolveBlock = (Any?) -> Void
typealias RCTPromiseRejectBlock = (String?, String?, Error?) -> Void
struct MediaURL {
    let value: URL
    init?(object: Any?) {
        guard let raw = object as? String, let url = URL(string: raw) else { return nil }
        value = url
    }
}
// Framework doubles; the two production Swift method bodies are injected by the runner.
class Track {
    var url: MediaURL
    var headers: [String: Any]? = ["Authorization": "test"]
    var originalObject: [String: Any]
    init(_ qid: String) {
        url = MediaURL(object: "https://test/audio")!
        originalObject = ["id": qid, "url": "https://test/audio", "title": "Same song", "artwork": "cover", "type": "hls", "headers": ["Authorization": "test"]]
    }
    func toObject() -> [String: Any] { originalObject }
    // TRACK_PROMOTION
}
class Player { var items: [Any] = []; var currentIndex = 0 }
class Module {
    let player = Player()
    func rejectWhenNotInitialized(reject: RCTPromiseRejectBlock) -> Bool { false }
    // QUEUE_PROMOTION
}
let module = Module()
let current = Track("occurrence-1")
let next = Track("occurrence-2")
module.player.items = [current, next]
let local = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".flac")
try Data([0, 1]).write(to: local)
defer { try? FileManager.default.removeItem(at: local) }
func promote(_ qid: String, _ expected: String, _ url: String) -> Bool {
    var result = false
    module.promoteUpcomingTrackSource(qid: qid, expectedURL: expected, source: ["url": url, "contentType": "audio/flac"], resolve: { result = ($0 as? Bool) ?? false }, reject: { _, _, _ in preconditionFailure() })
    return result
}
precondition(!promote("occurrence-1", "https://test/audio", local.absoluteString), "Must not touch playing item")
precondition(!promote("occurrence-2", "stale-url", local.absoluteString), "Must reject stale source")
precondition(!promote("missing", "https://test/audio", local.absoluteString), "Must not guess queue occurrence")
precondition(!promote("occurrence-2", "https://test/audio", "https://test/new"), "Local promotion must reject network sources")
precondition(!promote("occurrence-2", "https://test/audio", "file:///missing/audio.flac"), "Must reject evicted files")
precondition(promote("occurrence-2", "https://test/audio", local.absoluteString))
precondition(module.player.items.count == 2 && module.player.currentIndex == 0)
precondition((module.player.items[1] as? Track) === next, "Must preserve object/queue identity")
precondition(current.url.value.absoluteString == "https://test/audio")
precondition(next.url.value == local && next.headers == nil)
precondition(next.toObject()["id"] as? String == "occurrence-2")
precondition(next.toObject()["artwork"] as? String == "cover")
precondition(next.toObject()["title"] as? String == "Same song")
precondition(next.toObject()["contentType"] as? String == "audio/flac")
precondition(next.toObject()["type"] == nil && next.toObject()["headers"] == nil)
precondition(!promote("occurrence-2", "https://test/audio", local.absoluteString))
print("PASS: actual Swift promotion guards, metadata/MIME and queue identity preserved")
