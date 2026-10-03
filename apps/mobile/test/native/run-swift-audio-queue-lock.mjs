import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const mobile = fileURLToPath(new URL('../../', import.meta.url))
const dependency = resolve(mobile, 'ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx')
const output = resolve(mobile, '../../.cache/swift-audio-queue-lock')
mkdirSync(output, { recursive: true })
const main = resolve(output, 'main.swift')
writeFileSync(main, readFileSync(new URL('./swift-audio-queue-lock.swift', import.meta.url)))
execFileSync('swiftc', [resolve(dependency, 'AudioPlayerError.swift'), resolve(dependency, 'QueueManager.swift'), main, '-o', resolve(output, 'queue-lock')], { stdio: 'inherit' })
execFileSync(resolve(output, 'queue-lock'), { stdio: 'inherit', timeout: 12000 })
