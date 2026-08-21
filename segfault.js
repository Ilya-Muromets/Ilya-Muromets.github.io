(function () {
  'use strict';

  var consoleForm = document.querySelector('.segfault-console');
  var history = document.querySelector('.terminal-history');
  var input = document.querySelector('.terminal-input');
  if (!consoleForm || !history || !input) return;

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
    input.focus();
  });

  window.addEventListener('resize', trimHistory);
  input.focus({ preventScroll: true });
})();
