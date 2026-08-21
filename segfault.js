(function () {
  'use strict';

  var consoleForm = document.querySelector('.segfault-console');
  var history = document.querySelector('.terminal-history');
  var input = document.querySelector('.terminal-input');
  if (!consoleForm || !history || !input) return;

  var files = {
    'README.txt': [
      'Welcome to ilyac.info.',
      '',
      'You found the tiny filesystem behind cout.',
      'There is only this file. Please put it back when you are done.'
    ]
  };

  function focusInput() {
    input.focus({ preventScroll: true });
  }

  function appendLine(text, className) {
    var line = document.createElement('div');
    line.className = 'terminal-entry' + (className ? ' ' + className : '');
    line.textContent = text;
    history.appendChild(line);
  }

  function runCommand(commandLine) {
    var args = commandLine.trim().split(/\s+/);
    var command = args.shift();
    if (!command) return;

    if (command === 'ls') {
      if (!args.length) {
        appendLine('README.txt', 'terminal-file');
        return;
      }

      args.forEach(function (name) {
        if (Object.prototype.hasOwnProperty.call(files, name)) {
          appendLine(name, 'terminal-file');
        } else {
          appendLine("ls: cannot access '" + name + "': No such file or directory");
        }
      });
      return;
    }

    if (command === 'cat') {
      if (!args.length) {
        appendLine('cat: missing file operand');
        return;
      }

      args.forEach(function (name) {
        if (!Object.prototype.hasOwnProperty.call(files, name)) {
          appendLine('cat: ' + name + ': No such file or directory');
          return;
        }

        files[name].forEach(function (line) {
          appendLine(line);
        });
      });
      return;
    }

    appendLine(command + ': command not found');
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

    var commandLine = input.value;
    appendLine('~$ ' + commandLine);
    input.value = '';
    runCommand(commandLine);

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
