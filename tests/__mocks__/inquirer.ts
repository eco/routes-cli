// Minimal inquirer stub for jest. The real package is ESM-only and breaks
// CommonJS jest unless transformed; tests that need actual prompt behavior
// should mock PromptService directly.
const inquirer = {
  prompt: () => Promise.resolve({}),
};

export default inquirer;
