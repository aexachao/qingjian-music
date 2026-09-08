export class QueueOccurrenceIds {
  private next = 0

  constructor(private readonly session = createSessionId()) {}

  create(serverId: string, trackId: string): string {
    this.next += 1
    return `${serverId}:${trackId}:${this.session}:${this.next.toString(36)}`
  }
}

function createSessionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
