import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const mobile = fileURLToPath(new URL('../../', import.meta.url))
const dependency = resolve(mobile, 'node_modules/react-native-track-player/ios/RNTrackPlayer')
function method(file, signature) {
  const source = readFileSync(resolve(dependency, file), 'utf8')
  const start = source.indexOf(signature)
  if (start < 0) throw new Error(`Native method missing: ${signature}`)
  const body = source.indexOf('{', start)
  let depth = 1, end = body + 1
  while (depth && end < source.length) {
    if (source[end] === '{') depth++
    else if (source[end] === '}') depth--
    end++
  }
  if (depth) throw new Error('Unbalanced native method')
  return source.slice(start, end)
}
const output = resolve(mobile, '../../.cache/native-queue-source')
mkdirSync(output, { recursive: true })
let source = readFileSync(new URL('./native-queue-source.swift', import.meta.url), 'utf8')
source = source.replace('// TRACK_PROMOTION', method('Models/Track.swift', 'func promoteLocalSource('))
source = source.replace('// QUEUE_PROMOTION', method('RNTrackPlayer.swift', 'public func promoteUpcomingTrackSource('))
const main = resolve(output, 'main.swift')
writeFileSync(main, source)
execFileSync('swiftc', [main, '-o', resolve(output, 'queue-source')], { stdio: 'inherit' })
execFileSync(resolve(output, 'queue-source'), { stdio: 'inherit', timeout: 12000 })
