/**
 * All authoritative randomness passes through this module.  The sequential
 * stream is used during world generation; keyed values are used for action
 * outcomes so an unrelated random call cannot contaminate later results.
 */

export interface RandomStateOwner {
  randomState: number;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function hashChannel(channel: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < channel.length; index += 1) {
    hash ^= channel.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function nextRandomU32(owner: RandomStateOwner): number {
  // A compact PCG-inspired 32-bit stream. `Math.imul` fixes multiplication to
  // 32-bit integer semantics across Node and browsers.
  const previous = owner.randomState >>> 0;
  owner.randomState = (Math.imul(previous, 747796405) + 2891336453) >>> 0;
  const shift = ((previous >>> 28) + 4) >>> 0;
  const word = Math.imul(((previous >>> shift) ^ previous) >>> 0, 277803737);
  return ((word >>> 22) ^ word) >>> 0;
}

export function keyedRandomU32(
  seed: number,
  channel: string,
  tick: number,
  actorId = 0,
  targetId = 0,
  nonce = 0,
): number {
  let value = mix32((seed ^ hashChannel(channel)) >>> 0);
  value = mix32((value ^ Math.imul(tick | 0, 0x9e3779b1)) >>> 0);
  value = mix32((value ^ Math.imul(actorId | 0, 0x85ebca6b)) >>> 0);
  value = mix32((value ^ Math.imul(targetId | 0, 0xc2b2ae35)) >>> 0);
  return mix32((value ^ Math.imul(nonce | 0, 0x27d4eb2f)) >>> 0);
}

/**
 * Returns an integer in the inclusive normalized range 0..10_000.
 */
export function keyedRandomUnit(
  seed: number,
  channel: string,
  tick: number,
  actorId = 0,
  targetId = 0,
  nonce = 0,
): number {
  return keyedRandomU32(seed, channel, tick, actorId, targetId, nonce) % 10_001;
}

/** Phase 4.3 identity-stable lifespan: 18,000 plus a keyed 0..4,000 span. */
export function naturalLifespanTicksFor(seed: number, identityId: number): number {
  return 18_000 + (keyedRandomU32(seed, "natural-lifespan", 0, identityId) % 4_001);
}

export function randomRange(
  owner: RandomStateOwner,
  minimumInclusive: number,
  maximumInclusive: number,
): number {
  const width = maximumInclusive - minimumInclusive + 1;
  return minimumInclusive + (nextRandomU32(owner) % width);
}
