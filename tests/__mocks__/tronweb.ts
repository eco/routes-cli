// Pass-through mock — re-exports real tronweb so tests work by default.
// Call jest.mock('tronweb', () => ({ ... })) in individual tests to override.
module.exports = jest.requireActual('tronweb');
