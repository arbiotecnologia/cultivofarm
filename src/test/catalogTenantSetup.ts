import '@testing-library/jest-dom/vitest';
globalThis.fetch=async()=>{throw new Error('Network is forbidden in isolated UI tests');};
