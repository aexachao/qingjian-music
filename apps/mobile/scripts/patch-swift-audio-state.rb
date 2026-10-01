# SwiftAudioEx 1.1.0 invokes its delegate while holding stateQueue's write barrier.
# QueueManager callbacks can read state while holding their own recursive lock,
# so invoking the delegate under that barrier creates a lock-order inversion.
def patch_swift_audio_state(installer)
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
