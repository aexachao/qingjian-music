import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const mobile = fileURLToPath(new URL('../../', import.meta.url))
const sourceFile = process.argv[2] ?? resolve(mobile, 'ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift')
const source = readFileSync(sourceFile, 'utf8')
const accessor = source.slice(source.indexOf('    var _state:'), source.indexOf('    fileprivate(set) var lastPlayerTimeControlStatus:'))
if (!accessor.includes('stateQueue') || !accessor.includes('didChangeState')) throw new Error('Actual dependency state accessor not found')
const output = resolve(mobile, '../../.cache/swift-audio-state-lock')
mkdirSync(output, { recursive: true })
const harness = `import Foundation
import Darwin
enum AVPlayerWrapperState { case idle, ready }
protocol AVPlayerWrapperDelegate: AnyObject { func AVWrapper(didChangeState state: AVPlayerWrapperState) }
final class AVPlayerWrapper {
  let stateQueue = DispatchQueue(label: "AVPlayerWrapper.stateQueue", attributes: .concurrent)
  weak var delegate: AVPlayerWrapperDelegate?
${accessor}
}
${readFileSync(new URL('./swift-audio-state-lock.swift', import.meta.url), 'utf8')}`
writeFileSync(resolve(output, 'main.swift'), harness)
execFileSync('swiftc', [resolve(output, 'main.swift'), '-o', resolve(output, 'state-lock')], { stdio: 'inherit' })
execFileSync(resolve(output, 'state-lock'), { stdio: 'inherit', timeout: 6000 })
