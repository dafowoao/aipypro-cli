const { CFG } = require('./config');

const DEFAULT_FALLBACKS = [
  'deepseek-v4-flash',
  'deepseek-chat',
  'gpt-4o-mini',
];

let currentModel = null;
let fallbackIndex = 0;

function initFallback() {
  currentModel = CFG.model;
  fallbackIndex = 0;
}

function getModel() {
  return currentModel || CFG.model;
}

function shouldFallback(error) {
  const msg = (error.message || '').toLowerCase();
  return msg.includes('rate limit') ||
         msg.includes('429') ||
         msg.includes('503') ||
         msg.includes('overloaded') ||
         msg.includes('timeout') ||
         msg.includes('context length');
}

function getNextModel() {
  const fallbacks = CFG.fallbackModels || DEFAULT_FALLBACKS;
  // 使用 fallbackIndex 追踪进度，避免 indexOf 找不到自定义模型的问题
  fallbackIndex++;
  if (fallbackIndex < fallbacks.length) {
    currentModel = fallbacks[fallbackIndex];
    return currentModel;
  }
  return null;
}

function resetToPrimary() {
  currentModel = CFG.model;
  fallbackIndex = 0;
}

function getModelChain() {
  const fallbacks = CFG.fallbackModels || DEFAULT_FALLBACKS;
  return [CFG.model, ...fallbacks];
}

module.exports = { initFallback, getModel, shouldFallback, getNextModel, resetToPrimary, getModelChain };
