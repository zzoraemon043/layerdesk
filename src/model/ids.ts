let nextId = 1;

export function createNodeId(): string {
  return `n${nextId++}`;
}
