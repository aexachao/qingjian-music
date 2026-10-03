import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const mobile = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve(mobile, '../../.cache/swift-audio-end-notification')
mkdirSync(output, { recursive: true })
const main = resolve(output, 'main.swift')
writeFileSync(main, readFileSync(new URL('./swift-audio-end-notification.swift', import.meta.url)))
execFileSync('swiftc', [resolve(mobile, 'ios/Pods/SwiftAudioEx/Sources/SwiftAudioEx/Observer/AVPlayerItemNotificationObserver.swift'), main, '-o', resolve(output, 'end-notification')], { stdio: 'inherit' })
execFileSync(resolve(output, 'end-notification'), { stdio: 'inherit', timeout: 12000 })
