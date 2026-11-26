// True when built as a standalone static bundle (zero Node.js backend, e.g. static web hosting).
export const IS_STATIC_MODE = import.meta.env.VITE_STATIC_MODE === '1';
