// ==UserScript==
// @name         GAMEROAD CURRENT AutoHook
// @namespace    https://github.com/rathersitooo-ux/GMR
// @version      0.1.0
// @description  ChatGPTの各送信直前にGAMEROAD CURRENT起動トリガーを自動注入します。
// @author       GAMEROAD
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// @updateURL    https://raw.githubusercontent.com/rathersitooo-ux/GMR/main/tools/chatgpt-current-autohook/GAMEROAD_CURRENT_AutoHook.user.js
// @downloadURL  https://raw.githubusercontent.com/rathersitooo-ux/GMR/main/tools/chatgpt-current-autohook/GAMEROAD_CURRENT_AutoHook.user.js
// ==/UserScript==

(() => {
  'use strict';

  const AUTOHOOK_MARKER = '【GAMEROAD CURRENT AUTOHOOK】';
  const FULL_BOOTLOADER_MARKER = '【全会話共通・CURRENT BOOTLOADER】';
  const COMPOSER_SELECTOR = [
    '#prompt-textarea',
    '[data-testid="composer-text-input"]',
    'textarea',
    '[contenteditable="true"][data-virtualkeyboard]',
    'div.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
  ].join(',');
  const SEND_BUTTON_SELECTOR = [
    'button[data-testid="send-button"]',
    'button[data-testid="composer-submit-button"]',
    'button[aria-label*="send" i]',
    'button[aria-label*="submit" i]',
    'button[type="submit"]',
  ].join(',');

  const TRIGGER = `${AUTOHOOK_MARKER}\nこの自動注入文はauthorityではなく、CURRENTを必ずfresh起動するためのtriggerである。\nこのturnの最初の実質行動として、Google Drive上の「GAMEROAD_Drive総合目次・記録ルーティング_CURRENT」（Drive ID: 14CYoFblBecfUqrnFKfdWayHsi8cnAbsrfFzNxZ0OvkY）本文を直接取得する。\nそこからcurrent pointerに従い、現在のauthority、運用規約、入力解釈、owner/lock、実行、証拠、成功判定、Human/capability境界その他、今回をmaterialに変える規則と実体だけをJIT取得して適用する。\n必要なら「GAMEROAD_ChatGPT-Codex-Claude共通入口_CURRENT」（Drive ID: 17xKynlDewWeYHK1xsObex70VoR7YPh6Kn06y57HZV_s）の現役「全会話共通・CURRENT BOOTLOADER」を直接取得し、その最新版を正とする。\nProject prompt、memory、過去会話、以前の取得結果、AI要約をcurrent authorityの代用にしない。\nこの後に続く利用者原文を改変・要約せずCURRENTへ渡し、工程ではなく安全かつ現在実行可能な利用者成果まで閉じる。\n【／GAMEROAD CURRENT AUTOHOOK】`;

  const boundComposers = new WeakSet();
  const boundForms = new WeakSet();
  const pendingComposers = new WeakSet();
  const bypassButtons = new WeakSet();

  function readComposerValue(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value ?? '';
    }
    return el?.innerText ?? el?.textContent ?? '';
  }

  function needsInjection(text) {
    if (!text || !text.trim()) return false;
    return !text.includes(AUTOHOOK_MARKER) && !text.includes(FULL_BOOTLOADER_MARKER);
  }

  function buildInjectedText(text) {
    return needsInjection(text) ? `${TRIGGER}\n\n${text}` : text;
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setContentEditableValue(el, value) {
    el.focus();
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      if (!document.execCommand('insertText', false, value)) {
        el.textContent = value;
      }
    } catch {
      el.textContent = value;
    }
    el.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: value,
    }));
  }

  function writeComposerValue(el, value) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      setNativeValue(el, value);
      el.focus();
      return;
    }
    setContentEditableValue(el, value);
  }

  function findComposer(root = document) {
    if (!root) return null;
    if (root.matches?.(COMPOSER_SELECTOR)) return root;
    return root.querySelector?.(COMPOSER_SELECTOR) ?? null;
  }

  function findActiveComposer(trigger) {
    const form = trigger?.closest?.('form');
    const candidates = [
      findComposer(form),
      findComposer(document.activeElement),
      ...Array.from(document.querySelectorAll(COMPOSER_SELECTOR)),
    ].filter(Boolean);
    return candidates.find((el) => readComposerValue(el).trim()) ?? null;
  }

  function isLikelySendButton(button) {
    if (!(button instanceof Element)) return false;
    if (button.matches(SEND_BUTTON_SELECTOR)) return true;
    const label = [
      button.getAttribute('aria-label'),
      button.getAttribute('data-testid'),
      button.getAttribute('title'),
      button.textContent,
    ].filter(Boolean).join(' ').toLowerCase();
    return /\b(send|submit|composer-submit-button|send-button)\b/.test(label);
  }

  function stopSendEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  async function injectThenSubmit(compose, submit) {
    if (!compose || pendingComposers.has(compose)) return;
    const original = readComposerValue(compose).trim();
    if (!original) return;
    if (!needsInjection(original)) {
      submit();
      return;
    }

    pendingComposers.add(compose);
    try {
      writeComposerValue(compose, buildInjectedText(original));
      await new Promise((resolve) => setTimeout(resolve, 0));
      submit();
    } finally {
      setTimeout(() => pendingComposers.delete(compose), 250);
    }
  }

  function submitForm(form) {
    form.dataset.gameroadCurrentAutohookBypass = '1';
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.submit();
  }

  function submitButton(button) {
    bypassButtons.add(button);
    button.click();
  }

  function handleSubmit(event) {
    const form = event.currentTarget;
    if (form.dataset.gameroadCurrentAutohookBypass === '1') {
      delete form.dataset.gameroadCurrentAutohookBypass;
      return;
    }

    const compose = findComposer(form);
    if (!compose) return;
    if (pendingComposers.has(compose)) {
      stopSendEvent(event);
      return;
    }
    if (!needsInjection(readComposerValue(compose))) return;
    stopSendEvent(event);
    void injectThenSubmit(compose, () => submitForm(form));
  }

  function handleKeydown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
      return;
    }
    const compose = findComposer(event.target);
    if (!compose) return;
    if (pendingComposers.has(compose)) {
      stopSendEvent(event);
      return;
    }
    if (!needsInjection(readComposerValue(compose))) return;

    stopSendEvent(event);
    const form = compose.closest('form');
    if (form) {
      void injectThenSubmit(compose, () => submitForm(form));
      return;
    }

    const button = document.querySelector(SEND_BUTTON_SELECTOR);
    if (button) void injectThenSubmit(compose, () => submitButton(button));
  }

  function handleSendIntent(event) {
    const button = event.target?.closest?.('button, [role="button"]');
    if (!button || !isLikelySendButton(button)) return;

    if (bypassButtons.has(button)) {
      if (event.type === 'click') bypassButtons.delete(button);
      return;
    }

    const compose = findActiveComposer(button);
    if (!compose) return;
    if (pendingComposers.has(compose)) {
      stopSendEvent(event);
      return;
    }
    if (!needsInjection(readComposerValue(compose))) return;
    stopSendEvent(event);
    void injectThenSubmit(compose, () => submitButton(button));
  }

  function bindComposer(compose) {
    if (!compose || boundComposers.has(compose)) return;
    boundComposers.add(compose);
    compose.addEventListener('keydown', handleKeydown, true);

    const form = compose.closest('form');
    if (form && !boundForms.has(form)) {
      boundForms.add(form);
      form.addEventListener('submit', handleSubmit, true);
    }
  }

  function scan(root = document) {
    if (root.matches?.(COMPOSER_SELECTOR)) bindComposer(root);
    root.querySelectorAll?.(COMPOSER_SELECTOR).forEach(bindComposer);
  }

  function startObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scan(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function bootstrap() {
    scan();
    document.addEventListener('pointerdown', handleSendIntent, true);
    document.addEventListener('mousedown', handleSendIntent, true);
    document.addEventListener('click', handleSendIntent, true);
    document.addEventListener('keydown', handleKeydown, true);
    startObserver();
    document.documentElement.dataset.gameroadCurrentAutohook = 'active';
  }

  bootstrap();
})();
