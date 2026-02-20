// Pass-through mock — re-exports real @solana/web3.js so tests work by default.
// Call jest.mock('@solana/web3.js', () => ({ ... })) in individual tests to override.
module.exports = jest.requireActual('@solana/web3.js');
