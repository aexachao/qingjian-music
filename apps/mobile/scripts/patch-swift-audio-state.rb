# SwiftAudioEx 1.1.0 invokes its delegate while holding stateQueue's write barrier.
# QueueManager callbacks can read state while holding their own recursive lock,
# so invoking the delegate under that barrier creates a lock-order inversion.
def patch_swift_audio_state(installer)
  patch_swift_audio_queue_lock(installer)
  patch_swift_audio_end_notification(installer)
  file = File.join(installer.sandbox.root.to_s, 'SwiftAudioEx/Sources/SwiftAudioEx/AVPlayerWrapper/AVPlayerWrapper.swift')
  source = File.read(file)
  marker = '// QJ: deliver state outside the stateQueue barrier.'
  return if source.include?(marker)

  original = '                    self.delegate?.AVWrapper(didChangeState: newValue)'
  raise 'SwiftAudioEx state callback changed; review the lock-order patch' unless source.scan(original).length == 1

  replacement = <<~'SWIFT'.rstrip
                      // QJ: deliver state outside the stateQueue barrier.
                      DispatchQueue.main.async { [weak self] in
                          self?.delegate?.AVWrapper(didChangeState: newValue)
                      }
  SWIFT
  # Keep the indentation of the surrounding dependency source.
  replacement = replacement.lines.map { |line| '                    ' + line }.join
  File.chmod(File.stat(file).mode | 0200, file)
  File.write(file, source.sub(original, replacement))
end

# A thrown queue validation error must release the recursive lock. Otherwise the
# RNTP thread retains it and main-thread state callbacks wait forever.
def patch_swift_audio_queue_lock(installer)
  file = File.join(installer.sandbox.root.to_s, 'SwiftAudioEx/Sources/SwiftAudioEx/QueueManager.swift')
  source = File.read(file)
  marker = '// QJ: release queue lock even when validation throws.'
  return if source.include?(marker)
  original = "        recursiveLock.lock()\n        let result = try action()\n        recursiveLock.unlock()\n        return result"
  raise 'SwiftAudioEx queue synchronization changed; review lock cleanup' unless source.scan(original).length == 1
  replacement = "        recursiveLock.lock()\n        #{marker}\n        defer { recursiveLock.unlock() }\n        return try action()"
  File.chmod(File.stat(file).mode | 0200, file)
  File.write(file, source.sub(original, replacement))
end

# Serialize automatic queue advancement with RNTP's main-queue commands. A delayed
# end notification must not advance a new item selected in the meantime.
def patch_swift_audio_end_notification(installer)
  file = File.join(installer.sandbox.root.to_s, 'SwiftAudioEx/Sources/SwiftAudioEx/Observer/AVPlayerItemNotificationObserver.swift')
  source = File.read(file)
  marker = '// QJ: serialize auto-advance and reject stale end notifications.'
  return if source.include?(marker)
  original = "    @objc private func itemDidPlayToEndTime() {\n        delegate?.itemDidPlayToEndTime()\n    }"
  raise 'SwiftAudioEx end notification changed; review queue serialization' unless source.scan(original).length == 1
  replacement = <<~'SWIFT'.rstrip
      @objc private func itemDidPlayToEndTime(_ notification: Notification) {
          // QJ: serialize auto-advance and reject stale end notifications.
          guard let item = notification.object as? AVPlayerItem else { return }
          let deliver = { [weak self, weak item] in
              guard let self = self, let item = item, self.observingItem === item else { return }
              self.delegate?.itemDidPlayToEndTime()
          }
          if Thread.isMainThread { deliver() }
          else { DispatchQueue.main.async(execute: deliver) }
      }
  SWIFT
  replacement = replacement.lines.map { |line| '    ' + line }.join
  source = source.sub('#selector(itemDidPlayToEndTime)', '#selector(itemDidPlayToEndTime(_:))').sub(original, replacement)
  File.chmod(File.stat(file).mode | 0200, file)
  File.write(file, source)
end
