// Pass-through mock — re-exports real viem so tests work by default.
// Call jest.mock('viem', () => ({ ... })) in individual tests to override.
module.exports = jest.requireActual('viem');
