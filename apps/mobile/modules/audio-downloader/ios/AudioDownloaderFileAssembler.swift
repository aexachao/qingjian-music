import Foundation

enum AudioDownloaderFileAssembler {
  static func assemble(urls: [String], destination: URL, partsDirectory: URL) throws -> Int {
    let indexes = partIndexes(in: partsDirectory)
    guard indexes.count == urls.count else { throw NSError(domain: "AudioDownloader", code: 1) }
    if urls.count == 1 {
      try moveSinglePart(indexes[0], directory: partsDirectory, to: destination)
    } else {
      try copyParts(indexes, directory: partsDirectory, to: destination)
    }
    let size = fileSize(at: destination)
    guard size > 0 else { throw NSError(domain: "AudioDownloader", code: 2) }
    return size
  }

  private static func partIndexes(in directory: URL) -> [Int] {
    let names = (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []
    return names.compactMap { name in
      guard name.hasSuffix(".part") else { return nil }
      return Int(name.replacingOccurrences(of: ".part", with: ""))
    }.sorted()
  }

  private static func moveSinglePart(_ index: Int, directory: URL, to destination: URL) throws {
    let source = directory.appendingPathComponent(String(format: "%04d.part", index))
    guard fileSize(at: source) > 0 else { throw NSError(domain: "AudioDownloader", code: 3) }
    try replaceFile(at: destination)
    try FileManager.default.moveItem(at: source, to: destination)
  }

  private static func copyParts(_ indexes: [Int], directory: URL, to destination: URL) throws {
    let partial = URL(fileURLWithPath: destination.path + ".part")
    try? FileManager.default.removeItem(at: partial)
    guard FileManager.default.createFile(atPath: partial.path, contents: nil) else {
      throw NSError(domain: "AudioDownloader", code: 4)
    }
    let output = try FileHandle(forWritingTo: partial)
    do {
      for index in indexes {
        let source = directory.appendingPathComponent(String(format: "%04d.part", index))
        try copyPart(at: source, to: output)
      }
      try output.close()
    } catch {
      try? output.close()
      throw error
    }
    guard fileSize(at: partial) > 0 else { throw NSError(domain: "AudioDownloader", code: 5) }
    try replaceFile(at: destination)
    try FileManager.default.moveItem(at: partial, to: destination)
  }

  private static func copyPart(at source: URL, to output: FileHandle) throws {
    let input = try FileHandle(forReadingFrom: source)
    defer { try? input.close() }
    while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty {
      try output.write(contentsOf: chunk)
    }
  }

  private static func replaceFile(at url: URL) throws {
    try FileManager.default.createDirectory(
      at: url.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    if FileManager.default.fileExists(atPath: url.path) {
      try FileManager.default.removeItem(at: url)
    }
  }

  private static func fileSize(at url: URL) -> Int {
    let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
    return (attributes?[.size] as? NSNumber)?.intValue ?? 0
  }
}
