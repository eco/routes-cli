// Registers all built-in chain handlers into the chainRegistry singleton before each test suite.
// Required because tests import AddressNormalizer directly, bypassing index.ts which normally
// performs this registration as side-effect imports.
import '@/blockchain/evm/evm-chain-handler';
import '@/blockchain/tvm/tvm-chain-handler';
import '@/blockchain/svm/svm-chain-handler';
