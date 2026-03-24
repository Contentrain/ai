export class ContentrainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ContentrainError'
  }
}
