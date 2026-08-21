(function () {
  'use strict';

  var consoleForm = document.querySelector('.segfault-console');
  var history = document.querySelector('.terminal-history');
  var input = document.querySelector('.terminal-input');
  if (!consoleForm || !history || !input) return;

  function focusInput() {
    input.focus({ preventScroll: true });
  }

  function trimHistory() {
    if (!history.firstElementChild) return;

    var lineHeight = history.firstElementChild.getBoundingClientRect().height;
    var maxHeight = parseFloat(window.getComputedStyle(history).maxHeight);
    var capacity = Math.max(1, Math.floor(maxHeight / lineHeight));

    while (history.children.length > capacity) {
      history.removeChild(history.firstChild);
    }
  }

  consoleForm.addEventListener('submit', function (event) {
    event.preventDefault();

    var entry = document.createElement('div');
    entry.className = 'terminal-entry';
    entry.textContent = '~$ ' + input.value;
    history.appendChild(entry);
    input.value = '';

    window.requestAnimationFrame(trimHistory);
  });

  consoleForm.addEventListener('click', function () {
    focusInput();
  });

  document.addEventListener('keydown', function (event) {
    if (document.activeElement === input) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    var interactiveTarget = event.target instanceof Element
      ? event.target.closest('a, button')
      : null;
    if (interactiveTarget && (event.key === 'Enter' || event.key === ' ')) return;

    if (event.key.length === 1) {
      event.preventDefault();
      input.value += event.key;
      focusInput();
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (event.key === 'Backspace') {
      event.preventDefault();
      input.value = input.value.slice(0, -1);
      focusInput();
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      focusInput();
      consoleForm.requestSubmit();
    }
  });

  window.addEventListener('focus', focusInput);
  window.addEventListener('resize', trimHistory);
  focusInput();
})();
