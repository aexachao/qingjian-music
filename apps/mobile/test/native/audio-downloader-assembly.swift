import Foundation

@main
enum AudioDownloaderFileAssemblerTests {
  static func main() throws {
    let root = FileManager.default.temporaryDirectory
      .appendingPathComponent("audio-downloader-assembly-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }

    try testSinglePartMove(in: root)
    try testMultipartCopy(in: root)
    try testEmptyAndMissingParts(in: root)
    print("AudioDownloaderFileAssembler: 3 checks passed")
  }

  private static func testSinglePartMove(in root: URL) throws {
    let parts = root.appendingPathComponent("single-parts", isDirectory: true)
    try FileManager.default.createDirectory(at: parts, withIntermediateDirectories: true)
    let destination = root.appendingPathComponent("single-output.audio")
    let input = patternedData(count: 64_003, offset: 0)
    try input.write(to: parts.appendingPathComponent("0000.part"))

    let written = try AudioDownloaderFileAssembler.assemble(
      urls: ["https://example.invalid/audio"],
      destination: destination,
      partsDirectory: parts
    )

    try expect(written == input.count, "single-part size must match")
    let output = try Data(contentsOf: destination)
    try expect(output == input, "single-part move must preserve exact bytes")
    let movedSource = parts.appendingPathComponent("0000.part").path
    try expect(!FileManager.default.fileExists(atPath: movedSource), "single part must be moved")
  }

  private static func testMultipartCopy(in root: URL) throws {
    let parts = root.appendingPathComponent("multi-parts", isDirectory: true)
    try FileManager.default.createDirectory(at: parts, withIntermediateDirectories: true)
    let destination = root.appendingPathComponent("multi-output.audio")
    let first = patternedData(count: 2 * 1024 * 1024 + 137, offset: 0)
    let second = patternedData(count: 1024 * 1024 + 509, offset: 37)
    try first.write(to: parts.appendingPathComponent("0000.part"))
    try second.write(to: parts.appendingPathComponent("0001.part"))

    let written = try AudioDownloaderFileAssembler.assemble(
      urls: ["https://example.invalid/part-0", "https://example.invalid/part-1"],
      destination: destination,
      partsDirectory: parts
    )
    let output = try Data(contentsOf: destination)

    try expect(written == first.count + second.count, "multipart size must match the source parts")
    try expect(output == first + second, "multipart output must concatenate exact bytes across large chunks")
    let temporaryOutput = destination.appendingPathExtension("part").path
    try expect(!FileManager.default.fileExists(atPath: temporaryOutput), "temporary output must be renamed away")
  }

  private static func testEmptyAndMissingParts(in root: URL) throws {
    let emptyParts = root.appendingPathComponent("empty-parts", isDirectory: true)
    try FileManager.default.createDirectory(at: emptyParts, withIntermediateDirectories: true)
    try Data().write(to: emptyParts.appendingPathComponent("0000.part"))
    let emptyDestination = root.appendingPathComponent("empty-output.audio")
    try expectThrows("empty single part must fail") {
      _ = try AudioDownloaderFileAssembler.assemble(
        urls: ["https://example.invalid/empty"],
        destination: emptyDestination,
        partsDirectory: emptyParts
      )
    }
    try expect(
      !FileManager.default.fileExists(atPath: emptyDestination.path),
      "empty input must not create a final file"
    )

    let missingParts = root.appendingPathComponent("missing-parts", isDirectory: true)
    try FileManager.default.createDirectory(at: missingParts, withIntermediateDirectories: true)
    try Data([1, 2, 3]).write(to: missingParts.appendingPathComponent("0000.part"))
    let missingDestination = root.appendingPathComponent("missing-output.audio")
    try expectThrows("missing multipart part must fail") {
      _ = try AudioDownloaderFileAssembler.assemble(
        urls: ["https://example.invalid/part-0", "https://example.invalid/part-1"],
        destination: missingDestination,
        partsDirectory: missingParts
      )
    }
    try expect(
      !FileManager.default.fileExists(atPath: missingDestination.path),
      "missing input must not create a final file"
    )
  }

  private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    guard condition() else { throw TestFailure(description: message) }
  }

  private static func expectThrows(_ message: String, body: () throws -> Void) throws {
    do {
      try body()
    } catch {
      return
    }
    throw TestFailure(description: message)
  }

  private static func patternedData(count: Int, offset: Int) -> Data {
    var bytes: [UInt8] = []
    bytes.reserveCapacity(count)
    for index in 0..<count {
      bytes.append(UInt8((index + offset) % 251))
    }
    return Data(bytes)
  }
}

struct TestFailure: Error, CustomStringConvertible {
  let description: String
}
