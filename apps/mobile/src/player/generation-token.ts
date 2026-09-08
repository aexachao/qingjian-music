export class GenerationToken {
  private value = 0

  capture(): number {
    return this.value
  }

  advance(): number {
    this.value += 1
    return this.value
  }

  isCurrent(token: number): boolean {
    return token === this.value
  }
}
